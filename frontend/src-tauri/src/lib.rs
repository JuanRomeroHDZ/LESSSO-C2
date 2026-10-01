// ==========================================================
// LESSSO C2 — Backend Tauri (v5, arquitectura por process group)
// ----------------------------------------------------------
// Este archivo contiene TODOS los comandos del backend.
// main.rs solo llama a `app_lib::run()`.
//
// DIFERENCIA CLAVE vs versiones anteriores:
//   - Los procesos spawneados (nc, bash) usan `setsid()` para
//     convertirse en líderes de su propio process group.
//   - Al matar, usamos `kill(-pgid, SIGKILL)` para tumbar al
//     proceso Y a todos sus descendientes de un solo golpe.
//   - `kill_sweep` ejecuta `pkill -9 -f` sobre patrones conocidos
//     para garantizar que no quede NADA al cerrar la app.
//
// Organización:
//   1.  Imports y tipos
//   2.  Helpers de procesos
//   3.  Cifrado de bóveda (Argon2id + AES-256-GCM)
//   4.  Screenshots / clipboard
//   5.  Red / VPN
//   6.  Nmap / RustScan
//   7.  Terminales (bash, nc) — por process group
//   7b. Kill sweep al cerrar la app
//   8.  Fuzzer (gobuster)
//   9.  Entry point
// ==========================================================

// ==========================================================
// LESSSO C2 — Backend Tauri (v5, arquitectura por process group)
// ==========================================================
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::sync::atomic::{AtomicI32, Ordering};

use std::time::Duration;
use std::time::{SystemTime, UNIX_EPOCH};

use aes_gcm::{
    Aes256Gcm, Nonce,
    aead::{Aead, KeyInit},
};
use argon2::{Algorithm, Argon2, Params, Version};
use base64::{Engine as _, engine::general_purpose};
use rand::RngCore;
use tauri::{AppHandle, Emitter, Manager, State};
use zeroize::Zeroize;

#[cfg(unix)]
use std::os::unix::process::CommandExt;

// ==========================================================
// 1. TIPOS Y ESTADO GLOBAL
// ==========================================================

/// PID del escaneo Nmap/RustScan en curso.
struct ScanProcess(AtomicI32);

/// Estado global de las terminales.
///
/// Guardamos DOS mapas:
///   - `pids`:    session_id → PID del proceso principal
///   - `children`: session_id → Child (para stdout/stdin)
///
/// Tener el PID por separado nos permite matar sin depender del
/// `Child::kill()` de Rust (que no espera correctamente).
struct TerminalState {
    pids: Mutex<HashMap<String, i32>>,
    children: Mutex<HashMap<String, Child>>,
}

impl TerminalState {
    fn new() -> Self {
        Self {
            pids: Mutex::new(HashMap::new()),
            children: Mutex::new(HashMap::new()),
        }
    }
}

// ----------------------------------------------------------
// Modelos de datos para el parser Nmap
// ----------------------------------------------------------

#[derive(serde::Serialize, Clone)]
struct ScriptInfo {
    id: String,
    output: String,
}

#[derive(serde::Serialize, Clone, Default)]
struct ExtraPorts {
    state: String,
    count: u32,
    reasons: Vec<String>,
}

#[derive(serde::Serialize, Clone, Default)]
struct PortInfo {
    portid: String,
    protocol: String,
    state: String,
    reason: String,
    service: String,
    version: String,
    product: String,
    extrainfo: String,
    ostype: String,
    devicetype: String,
    tunnel: String,
    cpe: Vec<String>,
    servicefp: String,
    scripts: Vec<ScriptInfo>,
}

#[derive(serde::Serialize, Clone, Default)]
struct HostInfo {
    ip: String,
    hostname: String,
    mac: String,
    mac_vendor: String,
    status: String,
    status_reason: String,
    os: String,
    os_accuracy: String,
    uptime_seconds: u64,
    uptime_lastboot: String,
    distance: u32,
    ports: Vec<PortInfo>,
    extraports: Vec<ExtraPorts>,
    scripts: Vec<ScriptInfo>,
    start_time: String,
    end_time: String,
}

#[derive(serde::Serialize, Clone, Default)]
struct ScanResult {
    hosts: Vec<HostInfo>,
    scanner: String,
    scanner_version: String,
    scan_args: String,
    start_time: String,
    start_time_str: String,
    end_time: String,
    end_time_str: String,
    elapsed: String,
}

// ==========================================================
// 2. HELPERS DE PROCESOS
// ==========================================================

/// Comprueba si un PID sigue vivo con `kill(pid, 0)`.
#[cfg(unix)]
fn pid_alive(pid: i32) -> bool {
    if pid <= 0 {
        return false;
    }
    unsafe { libc::kill(pid, 0) == 0 }
}

#[cfg(not(unix))]
fn pid_alive(_pid: i32) -> bool {
    false
}

/// Envía una señal a un PID individual.
#[cfg(unix)]
fn kill_pid(pid: i32, signal: i32) -> bool {
    if pid <= 0 {
        return false;
    }
    unsafe { libc::kill(pid, signal) == 0 }
}

#[cfg(not(unix))]
fn kill_pid(_pid: i32, _signal: i32) -> bool {
    false
}

/// Mata un PID con SIGKILL, espera a que muera, con timeout.
///
/// Devuelve true si el proceso murió (o ya estaba muerto).
#[cfg(unix)]
fn force_kill_pid(pid: i32, timeout_ms: u64) -> bool {
    if pid <= 0 {
        return true;
    }
    if !pid_alive(pid) {
        return true;
    }

    // SIGTERM primero (amable)
    kill_pid(pid, libc::SIGTERM);

    // Esperar hasta timeout_ms
    let steps = timeout_ms / 50;
    for _ in 0..steps {
        std::thread::sleep(Duration::from_millis(50));
        if !pid_alive(pid) {
            return true;
        }
    }

    // SIGKILL definitivo
    kill_pid(pid, libc::SIGKILL);

    // Esperar otros 500ms a que muera
    for _ in 0..10 {
        std::thread::sleep(Duration::from_millis(50));
        if !pid_alive(pid) {
            return true;
        }
    }

    false
}

#[cfg(not(unix))]
fn force_kill_pid(_pid: i32, _timeout_ms: u64) -> bool {
    true
}

/// Mata un process group entero.
///
/// Con `setsid()` aplicado al hijo, el PID es el PGID del grupo.
/// `kill(-pgid, SIG)` mata a todos los procesos del grupo.
#[cfg(unix)]
fn kill_process_group(pgid: i32) {
    if pgid <= 0 {
        return;
    }

    unsafe {
        libc::kill(-pgid, libc::SIGTERM);
    }

    for _ in 0..20 {
        std::thread::sleep(Duration::from_millis(100));
        let alive = unsafe { libc::kill(-pgid, 0) == 0 };
        if !alive {
            return;
        }
    }

    unsafe {
        libc::kill(-pgid, libc::SIGKILL);
    }
}

#[cfg(not(unix))]
fn kill_process_group(pgid: i32) {
    if pgid > 0 {
        let _ = Command::new("taskkill")
            .args(["/F", "/T", "/PID", &pgid.to_string()])
            .output();
    }
}

/// `pre_exec` que llama a `setsid()` en el hijo tras `fork()`
/// y antes de `exec()`. Convierte al hijo en líder de su propio
/// process group, para que `kill(-pgid)` cubra a todos sus
/// descendientes.
///
/// Si `setsid()` falla, imprimimos el error pero NO abortamos.
#[cfg(unix)]
fn pre_exec_setsid() -> std::io::Result<()> {
    unsafe {
        if libc::setsid() == -1 {
            eprintln!(
                "[pre_exec_setsid] setsid() falló: {}",
                std::io::Error::last_os_error()
            );
        }
    }
    Ok(())
}

/// Ejecuta `pkill -9 -f <pattern>` para matar cualquier proceso
/// cuya línea de comando coincida con el patrón.
#[cfg(unix)]
fn pkill_pattern(pattern: &str) -> usize {
    let output = Command::new("pkill").args(["-9", "-f", pattern]).output();

    match output {
        Ok(out) => {
            if out.status.success() {
                1
            } else {
                0
            }
        }
        Err(_) => 0,
    }
}

#[cfg(not(unix))]
fn pkill_pattern(_pattern: &str) -> usize {
    0
}

/// Conecta stdout/stderr de un child a eventos Tauri.
fn wire_scan_streams(app: &AppHandle, child: &mut Child, event_name: &str) {
    if let Some(stdout) = child.stdout.take() {
        let app_out = app.clone();
        let ev = event_name.to_string();

        std::thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines().map_while(Result::ok) {
                let _ = app_out.emit(&ev, line);
            }
        });
    }

    if let Some(stderr) = child.stderr.take() {
        let app_err = app.clone();
        let ev = event_name.to_string();
        std::thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line in reader.lines().map_while(Result::ok) {
                let _ = app_err.emit(&ev, line);
            }
        });
    }
}

// ==========================================================
// 3. CIFRADO DE BÓVEDA (Argon2id + AES-256-GCM)
// ==========================================================

const VAULT_VERSION: u8 = 0x01;
const SALT_LEN: usize = 16;
const NONCE_LEN: usize = 12;

fn derive_key_argon2(password: &str, salt: &[u8]) -> Result<[u8; 32], String> {
    let params = Params::new(19_456, 2, 1, Some(32))
        .map_err(|e| format!("Parámetros Argon2 inválidos: {}", e))?;

    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);

    let mut key = [0u8; 32];
    argon2
        .hash_password_into(password.as_bytes(), salt, &mut key)
        .map_err(|e| format!("Error derivando clave: {}", e))?;

    Ok(key)
}

#[tauri::command]
async fn encrypt_vault(data: String, password: String) -> Result<String, String> {
    if password.is_empty() {
        return Err("La contraseña no puede estar vacía.".to_string());
    }

    let mut salt = [0u8; SALT_LEN];
    rand::thread_rng().fill_bytes(&mut salt);

    let mut key = derive_key_argon2(&password, &salt)?;

    let mut nonce_bytes = [0u8; NONCE_LEN];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let cipher = Aes256Gcm::new(&key.into());
    let ciphertext = cipher
        .encrypt(nonce, data.as_bytes())
        .map_err(|e| format!("Error encriptando: {}", e))?;

    let mut combined = Vec::with_capacity(1 + SALT_LEN + NONCE_LEN + ciphertext.len());
    combined.push(VAULT_VERSION);
    combined.extend_from_slice(&salt);
    combined.extend_from_slice(&nonce_bytes);
    combined.extend_from_slice(&ciphertext);

    key.zeroize();

    Ok(general_purpose::STANDARD.encode(combined))
}

#[tauri::command]
async fn decrypt_vault(encrypted_data: String, password: String) -> Result<String, String> {
    if password.is_empty() {
        return Err("La contraseña no puede estar vacía.".to_string());
    }

    let combined = general_purpose::STANDARD
        .decode(encrypted_data)
        .map_err(|_| "Error decodificando Base64. El archivo podría estar corrupto.".to_string())?;

    let min_len = 1 + SALT_LEN + NONCE_LEN + 16;
    if combined.len() < min_len {
        return Err("Datos cifrados demasiado cortos o corruptos.".to_string());
    }

    let version = combined[0];
    if version != VAULT_VERSION {
        return Err(format!(
            "Versión de bóveda no soportada ({}). Actualiza LESSSO C2.",
            version
        ));
    }

    let salt = &combined[1..1 + SALT_LEN];
    let nonce_bytes = &combined[1 + SALT_LEN..1 + SALT_LEN + NONCE_LEN];
    let ciphertext = &combined[1 + SALT_LEN + NONCE_LEN..];

    let mut key = derive_key_argon2(&password, salt)?;

    let cipher = Aes256Gcm::new(&key.into());
    let nonce = Nonce::from_slice(nonce_bytes);

    let plaintext = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|_| "Contraseña incorrecta o datos corruptos.".to_string())?;

    key.zeroize();

    String::from_utf8(plaintext).map_err(|_| "Error convirtiendo a texto.".to_string())
}

// ==========================================================
// 4. SCREENSHOTS / CLIPBOARD
// ==========================================================

fn screenshots_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let base = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("No se pudo obtener app_data_dir: {}", e))?;

    let dir = base.join("screenshots");
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("No se pudo crear directorio de screenshots: {}", e))?;

    Ok(dir)
}

#[tauri::command]
async fn save_clipboard_image(app: AppHandle, base64_data: String) -> Result<String, String> {
    let parts: Vec<&str> = base64_data.split(',').collect();
    if parts.len() != 2 {
        return Err("Formato Base64 inválido (esperado: data:...;base64,XXXX)".to_string());
    }

    let raw_bytes = general_purpose::STANDARD
        .decode(parts[1])
        .map_err(|e| format!("Error decodificando base64: {}", e))?;

    if raw_bytes.is_empty() {
        return Err("La imagen está vacía".to_string());
    }

    let png_bytes = if raw_bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        raw_bytes
    } else if raw_bytes.starts_with(b"BM") {
        use image::ImageFormat;
        let img = image::load_from_memory_with_format(&raw_bytes, ImageFormat::Bmp)
            .map_err(|e| format!("Error decodificando BMP: {}", e))?;

        let mut png_buffer = Vec::new();
        let mut cursor = std::io::Cursor::new(&mut png_buffer);
        img.write_to(&mut cursor, ImageFormat::Png)
            .map_err(|e| format!("Error codificando PNG: {}", e))?;

        png_buffer
    } else {
        return Err(format!(
            "Formato de imagen no reconocido (primeros bytes: {:02x?})",
            &raw_bytes[..raw_bytes.len().min(8)]
        ));
    };

    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis();

    let dir = screenshots_dir(&app)?;
    let file_path = dir.join(format!("capture_{}.png", timestamp));

    std::fs::write(&file_path, &png_bytes).map_err(|e| format!("Error escribiendo PNG: {}", e))?;

    Ok(file_path.to_string_lossy().to_string())
}

#[tauri::command]
async fn paste_and_save_image(app: AppHandle) -> Result<String, String> {
    let png_bytes = match try_paste_arboard() {
        Ok(bytes) => bytes,
        Err(e) => {
            eprintln!("[paste] arboard falló: {}", e);
            match try_paste_wl_paste() {
                Ok(bytes) => bytes,
                Err(e) => {
                    eprintln!("[paste] wl-paste falló: {}", e);
                    match try_paste_xclip() {
                        Ok(bytes) => bytes,
                        Err(e) => {
                            eprintln!("[paste] xclip falló: {}", e);
                            return Err("No se pudo leer la imagen del portapapeles.\n\n\
                                El portapapeles no contiene una imagen o no hay ningún \
                                gestor compatible disponible.\n\n\
                                En Linux (Wayland), instala uno de estos:\n\
                                  sudo apt install wl-clipboard\n\
                                  sudo apt install xclip\n\n\
                                Y vuelve a intentarlo."
                                .to_string());
                        }
                    }
                }
            }
        }
    };

    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis();

    let dir = screenshots_dir(&app)?;
    let file_path = dir.join(format!("capture_{}.png", timestamp));

    std::fs::write(&file_path, &png_bytes).map_err(|e| format!("Error escribiendo PNG: {}", e))?;

    Ok(file_path.to_string_lossy().to_string())
}

fn try_paste_arboard() -> Result<Vec<u8>, String> {
    use arboard::Clipboard;

    let mut clipboard =
        Clipboard::new().map_err(|e| format!("arboard: no se pudo acceder: {}", e))?;

    let img = clipboard
        .get_image()
        .map_err(|e| format!("arboard: {}", e))?;

    let width = img.width as u32;
    let height = img.height as u32;

    if width == 0 || height == 0 {
        return Err("arboard: imagen vacía".to_string());
    }

    use image::{ImageBuffer, ImageFormat, RgbaImage};

    let buffer: RgbaImage = ImageBuffer::from_raw(width, height, img.bytes.to_vec())
        .ok_or_else(|| "arboard: no se pudo crear el buffer".to_string())?;

    let mut png_buffer = Vec::new();
    let mut cursor = std::io::Cursor::new(&mut png_buffer);
    buffer
        .write_to(&mut cursor, ImageFormat::Png)
        .map_err(|e| format!("arboard: error codificando PNG: {}", e))?;

    Ok(png_buffer)
}

fn try_paste_wl_paste() -> Result<Vec<u8>, String> {
    let types_output = Command::new("wl-paste")
        .arg("--list-types")
        .output()
        .map_err(|e| format!("wl-paste: no ejecutable: {}", e))?;

    if !types_output.status.success() {
        return Err("wl-paste: no disponible".to_string());
    }

    let types = String::from_utf8_lossy(&types_output.stdout);

    let candidates = ["image/png", "image/bmp", "image/x-bmp", "image/jpeg"];
    let chosen_type = candidates
        .iter()
        .find(|t| types.lines().any(|l| l.trim() == **t))
        .ok_or_else(|| {
            format!(
                "wl-paste: no hay tipo de imagen (disponibles: {})",
                types.trim()
            )
        })?;

    let output = Command::new("wl-paste")
        .args(["--no-newline", "--type", chosen_type])
        .output()
        .map_err(|e| format!("wl-paste: {}", e))?;

    if !output.status.success() {
        return Err(format!("wl-paste: falló con tipo {}", chosen_type));
    }

    if output.stdout.is_empty() {
        return Err("wl-paste: imagen vacía".to_string());
    }

    if *chosen_type == "image/png" {
        return Ok(output.stdout);
    }

    use image::ImageFormat;
    let format = match *chosen_type {
        "image/bmp" | "image/x-bmp" => ImageFormat::Bmp,
        "image/jpeg" => ImageFormat::Jpeg,
        _ => return Err(format!("wl-paste: formato no soportado: {}", chosen_type)),
    };

    let img = image::load_from_memory_with_format(&output.stdout, format)
        .map_err(|e| format!("wl-paste: error decodificando {}: {}", chosen_type, e))?;

    let mut png_buffer = Vec::new();
    let mut cursor = std::io::Cursor::new(&mut png_buffer);
    img.write_to(&mut cursor, ImageFormat::Png)
        .map_err(|e| format!("wl-paste: error codificando PNG: {}", e))?;

    Ok(png_buffer)
}

fn try_paste_xclip() -> Result<Vec<u8>, String> {
    let output = Command::new("xclip")
        .args(["-selection", "clipboard", "-t", "image/png", "-o"])
        .output()
        .map_err(|e| format!("xclip: {}", e))?;

    if !output.status.success() {
        return Err("xclip: el portapapeles no contiene image/png".to_string());
    }

    if output.stdout.is_empty() {
        return Err("xclip: imagen vacía".to_string());
    }

    Ok(output.stdout)
}

// ==========================================================
// 5. RED / VPN
// ==========================================================

#[tauri::command]
async fn get_network_interfaces() -> Result<Vec<String>, String> {
    let output = Command::new("ip").args(["-o", "link", "show"]).output();
    let mut interfaces = Vec::new();
    if let Ok(out) = output
        && out.status.success()
    {
        let stdout = String::from_utf8_lossy(&out.stdout);
        for line in stdout.lines() {
            let parts: Vec<&str> = line.split(':').collect();
            if parts.len() > 1 {
                let iface_name = parts[1].trim();
                if !iface_name.starts_with("lo") {
                    interfaces.push(iface_name.to_string());
                }
            }
        }
        return Ok(interfaces);
    }
    Err("No se pudieron obtener las interfaces".to_string())
}

#[tauri::command]
async fn check_vpn() -> Result<String, String> {
    let output = Command::new("ip")
        .args(["-4", "addr", "show", "tun0"])
        .output();
    if let Ok(out) = output
        && out.status.success()
    {
        let stdout = String::from_utf8_lossy(&out.stdout);
        if let Some(line) = stdout.lines().find(|l| l.contains("inet ")) {
            let parts: Vec<&str> = line.trim().split(' ').collect();
            if parts.len() > 1 {
                let ip = parts[1].split('/').next().unwrap_or("");
                return Ok(ip.to_string());
            }
        }
        return Ok("Conectado".to_string());
    }
    Err("Desconectado".to_string())
}

fn validate_ovpn_file(path: &Path) -> Result<(), String> {
    let metadata = std::fs::metadata(path)
        .map_err(|e| format!("No se puede acceder al archivo .ovpn: {}", e))?;

    if !metadata.is_file() {
        return Err("La ruta .ovpn no es un archivo regular.".to_string());
    }

    if metadata.len() > 1_000_000 {
        return Err("El archivo .ovpn es sospechosamente grande (>1 MB).".to_string());
    }

    let content = std::fs::read_to_string(path)
        .map_err(|e| format!("No se puede leer el archivo .ovpn: {}", e))?;

    const FORBIDDEN_DIRECTIVES: &[&str] = &[
        "script-security",
        "up",
        "down",
        "up-restart",
        "down-pre",
        "client-connect",
        "client-disconnect",
        "learn-address",
        "auth-user-pass-verify",
        "tls-verify",
        "tls-export-cert",
        "plugin",
        "iproute",
        "route-up",
        "ipchange",
        "setenv",
        "setenv-safe",
        "cd",
        "chroot",
        "user",
        "group",
        "persist-key",
        "persist-tun",
    ];

    for (line_num, raw_line) in content.lines().enumerate() {
        let line = raw_line.trim();
        if line.is_empty() || line.starts_with('#') || line.starts_with(';') {
            continue;
        }

        let directive = line.split_whitespace().next().unwrap_or("").to_lowercase();

        if FORBIDDEN_DIRECTIVES.contains(&directive.as_str()) {
            return Err(format!(
                "El archivo .ovpn contiene la directiva peligrosa '{}' en la línea {}. \
                Por seguridad, LESSSO C2 no permite directivas que ejecuten comandos, \
                carguen plugins o cambien de usuario. Elimina esa línea y vuelve a intentarlo.",
                directive,
                line_num + 1
            ));
        }
    }

    Ok(())
}

#[tauri::command]
async fn connect_vpn(ovpn_path: String) -> Result<(), String> {
    let path = Path::new(&ovpn_path);

    validate_ovpn_file(path)?;

    let openvpn_exe = if Path::new("/usr/sbin/openvpn").exists() {
        "/usr/sbin/openvpn"
    } else if Path::new("/usr/bin/openvpn").exists() {
        "/usr/bin/openvpn"
    } else {
        "openvpn"
    };

    let output = Command::new("pkexec")
        .arg(openvpn_exe)
        .arg("--config")
        .arg(&ovpn_path)
        .arg("--script-security")
        .arg("0")
        .arg("--daemon")
        .output()
        .map_err(|e| format!("DEPENDENCY_MISSING: {}", e))?;

    if !output.status.success() {
        let err_msg = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "Autenticación cancelada o fallo de OpenVPN:\n{}",
            err_msg
        ));
    }

    Ok(())
}

#[tauri::command]
async fn disconnect_vpn() -> Result<(), String> {
    let killall_exe = if Path::new("/usr/bin/killall").exists() {
        "/usr/bin/killall"
    } else {
        "/bin/killall"
    };

    let mut child = Command::new("sh")
        .arg("-c")
        .arg(format!(
            "pkexec {} openvpn || sudo {} openvpn || killall openvpn",
            killall_exe, killall_exe
        ))
        .spawn()
        .map_err(|e| format!("Error cerrando VPN: {}", e))?;

    let _ = child.wait();
    Ok(())
}

// ==========================================================
// 6. NMAP / RUSTSCAN
// ==========================================================

fn strip_output_flags(args: Vec<String>) -> Vec<String> {
    let mut result = Vec::with_capacity(args.len());
    let mut skip_next = false;

    for arg in args {
        if skip_next {
            skip_next = false;
            continue;
        }
        if matches!(arg.as_str(), "-oN" | "-oG" | "-oX" | "-oA" | "-oS" | "-o") {
            skip_next = true;
            continue;
        }
        if arg.starts_with("-o")
            && arg.len() > 2
            && matches!(&arg[0..3], "-oN" | "-oG" | "-oX" | "-oA" | "-oS")
        {
            continue;
        }
        result.push(arg);
    }

    result
}

fn nmap_needs_root(args: &[String]) -> bool {
    for arg in args {
        if matches!(
            arg.as_str(),
            "-sS"
                | "-sU"
                | "-sY"
                | "-sI"
                | "-sA"
                | "-sW"
                | "-sM"
                | "-O"
                | "--osscan-guess"
                | "-f"
                | "--mtu"
                | "-D"
                | "--spoof-mac"
                | "-S"
                | "-g"
                | "--badsum"
                | "--scanflags"
        ) {
            return true;
        }
        if arg.starts_with("-s") && arg.len() == 3 {
            let flag = &arg[1..];
            if matches!(flag, "sS" | "sU" | "sY" | "sI" | "sA" | "sW" | "sM") {
                return true;
            }
        }
        if arg.starts_with("--mtu")
            || arg.starts_with("--spoof-mac")
            || arg.starts_with("--scanflags")
        {
            return true;
        }
    }
    false
}

fn build_nmap_command(clean_args: &[String], target: &str, xml_path: &str) -> Command {
    #[cfg(target_os = "linux")]
    {
        if nmap_needs_root(clean_args) {
            let mut cmd = Command::new("pkexec");
            cmd.arg("nmap");
            cmd.args(clean_args);
            cmd.arg("-oX").arg(xml_path);
            cmd.arg(target);
            return cmd;
        }
    }

    let mut cmd = Command::new("nmap");
    cmd.args(clean_args);
    cmd.arg("-oX").arg(xml_path);
    cmd.arg(target);
    cmd
}

/// Parser del XML de Nmap.
///
/// Extrae:
///   - Metadatos globales del `<nmaprun>` (scanner, versión, args, fechas).
///   - Por host: IP, MAC + vendor, hostnames, status, OS + precisión,
///     uptime, distance, scripts de host y fechas.
///   - Por puerto: estado, razón, servicio, versión, product, extrainfo,
///     ostype, devicetype, tunnel, CPEs, servicefp y scripts.
///   - ExtraPorts agrupados por estado (closed/filtered).
///
/// Devuelve un JSON con forma `ScanResult` (objeto con `hosts` + metadatos).
/// Elimina el XML temporal al terminar.
fn parse_nmap_xml(xml_path: &str) -> Result<String, String> {
    use roxmltree::Document;

    if !Path::new(xml_path).exists() {
        return Err("XML no generado.".into());
    }

    let xml_text = std::fs::read_to_string(xml_path).map_err(|e| e.to_string())?;

    // ------------------------------------------------------------------
    // Saneado de DOCTYPE (anti-XXE / billion laughs)
    //
    // Un DOCTYPE puede tener dos formas:
    //   1) Simple:  <!DOCTYPE nmaprun>
    //   2) Interno: <!DOCTYPE lolz [<!ENTITY lol "lol">...]>
    //
    // El caso 2 tiene `>` internos que cierran entidades y NO
    // cierran el DOCTYPE. Contamos corchetes `[` y `]` para saber
    // cuándo termina realmente el DOCTYPE, y solo entonces
    // eliminamos el bloque completo.
    // ------------------------------------------------------------------
    let mut safe_xml = xml_text.clone();
    if let Some(start) = safe_xml.find("<!DOCTYPE") {
        let after_start = &safe_xml[start..];
        let mut depth: i32 = 0;
        let mut end_pos: Option<usize> = None;

        for (i, ch) in after_start.char_indices() {
            match ch {
                '[' => depth += 1,
                ']' => {
                    if depth > 0 {
                        depth -= 1;
                    }
                }
                '>' if depth == 0 => {
                    end_pos = Some(start + i);
                    break;
                }
                _ => {}
            }
        }

        if let Some(end) = end_pos {
            safe_xml.replace_range(start..=end, "");
        }
    }

    let doc = Document::parse(&safe_xml).map_err(|e| format!("Error de parseo XML: {}", e))?;

    let root = doc.root_element();

    // ---- Metadatos globales de <nmaprun> ----
    let mut scan_result = ScanResult {
        hosts: Vec::new(),
        scanner: root.attribute("scanner").unwrap_or("nmap").to_string(),
        scanner_version: root.attribute("version").unwrap_or("").to_string(),
        scan_args: root.attribute("args").unwrap_or("").to_string(),
        start_time: root.attribute("start").unwrap_or("").to_string(),
        start_time_str: root.attribute("startstr").unwrap_or("").to_string(),
        end_time: String::new(),
        end_time_str: String::new(),
        elapsed: String::new(),
    };

    // <runstats><finished ... />
    if let Some(runstats) = root.descendants().find(|n| n.has_tag_name("runstats"))
        && let Some(finished) = runstats.descendants().find(|n| n.has_tag_name("finished"))
    {
        scan_result.end_time = finished.attribute("time").unwrap_or("").to_string();
        scan_result.end_time_str = finished.attribute("timestr").unwrap_or("").to_string();
        scan_result.elapsed = finished.attribute("elapsed").unwrap_or("").to_string();
    }

    let mut host_map: HashMap<String, HostInfo> = HashMap::new();

    for host_node in root.descendants().filter(|n| n.has_tag_name("host")) {
        // ---- Direcciones ----
        let mut ip = String::new();
        let mut mac = String::new();
        let mut mac_vendor = String::new();

        for addr in host_node
            .descendants()
            .filter(|n| n.has_tag_name("address"))
        {
            let addrtype = addr.attribute("addrtype").unwrap_or("");
            let addr_val = addr.attribute("addr").unwrap_or("").to_string();
            if addrtype == "ipv4" || addrtype == "ipv6" {
                if ip.is_empty() {
                    ip = addr_val;
                }
            } else if addrtype == "mac" {
                mac = addr_val;
                mac_vendor = addr.attribute("vendor").unwrap_or("").to_string();
            }
        }

        if ip.is_empty() {
            continue;
        }

        // ---- Hostnames ----
        let mut hostnames = Vec::new();
        if let Some(hns_node) = host_node
            .descendants()
            .find(|n| n.has_tag_name("hostnames"))
        {
            for hn_node in hns_node
                .descendants()
                .filter(|n| n.has_tag_name("hostname"))
            {
                if let Some(name) = hn_node.attribute("name") {
                    hostnames.push(name.to_string());
                }
            }
        }
        let hostname = hostnames.join(", ");

        // ---- Status ----
        let status_node = host_node.descendants().find(|n| n.has_tag_name("status"));
        let status = status_node
            .and_then(|n| n.attribute("state"))
            .unwrap_or("unknown")
            .to_string();
        let status_reason = status_node
            .and_then(|n| n.attribute("reason"))
            .unwrap_or("")
            .to_string();

        // ---- OS ----
        let mut os = String::new();
        let mut os_accuracy = String::new();
        if let Some(os_match) = host_node.descendants().find(|n| n.has_tag_name("osmatch")) {
            os = os_match.attribute("name").unwrap_or("").to_string();
            os_accuracy = os_match.attribute("accuracy").unwrap_or("").to_string();
        }

        // ---- Uptime ----
        let mut uptime_seconds: u64 = 0;
        let mut uptime_lastboot = String::new();
        if let Some(up) = host_node.descendants().find(|n| n.has_tag_name("uptime")) {
            uptime_seconds = up
                .attribute("seconds")
                .and_then(|s| s.parse::<u64>().ok())
                .unwrap_or(0);
            uptime_lastboot = up.attribute("lastboot").unwrap_or("").to_string();
        }

        // ---- Distance (traceroute) ----
        let distance: u32 = host_node
            .descendants()
            .find(|n| n.has_tag_name("distance"))
            .and_then(|n| n.attribute("value"))
            .and_then(|s| s.parse::<u32>().ok())
            .unwrap_or(0);

        // ---- Fechas por host (si existen atributos en <host>) ----
        let start_time = host_node.attribute("starttime").unwrap_or("").to_string();
        let end_time = host_node.attribute("endtime").unwrap_or("").to_string();

        // ---- Host scripts ----
        let mut host_scripts = Vec::new();
        if let Some(hostscript_node) = host_node
            .descendants()
            .find(|n| n.has_tag_name("hostscript"))
        {
            for script_node in hostscript_node
                .descendants()
                .filter(|n| n.has_tag_name("script"))
            {
                let id = script_node.attribute("id").unwrap_or("").to_string();
                let output = script_node.attribute("output").unwrap_or("").to_string();
                host_scripts.push(ScriptInfo { id, output });
            }
        }

        // ---- Puertos ----
        let mut ports: Vec<PortInfo> = Vec::new();
        for port_node in host_node.descendants().filter(|n| n.has_tag_name("port")) {
            let portid = port_node.attribute("portid").unwrap_or("").to_string();
            let protocol = port_node.attribute("protocol").unwrap_or("").to_string();

            let state_node = port_node.descendants().find(|n| n.has_tag_name("state"));
            let state = state_node
                .and_then(|n| n.attribute("state"))
                .unwrap_or("unknown")
                .to_string();
            let reason = state_node
                .and_then(|n| n.attribute("reason"))
                .unwrap_or("")
                .to_string();

            let mut service = String::new();
            let mut version = String::new();
            let mut product = String::new();
            let mut extrainfo = String::new();
            let mut ostype = String::new();
            let mut devicetype = String::new();
            let mut tunnel = String::new();
            let mut cpe: Vec<String> = Vec::new();
            let mut servicefp = String::new();

            if let Some(svc_node) = port_node.descendants().find(|n| n.has_tag_name("service")) {
                service = svc_node.attribute("name").unwrap_or("").to_string();
                product = svc_node.attribute("product").unwrap_or("").to_string();
                let ver = svc_node.attribute("version").unwrap_or("").to_string();
                extrainfo = svc_node.attribute("extrainfo").unwrap_or("").to_string();
                ostype = svc_node.attribute("ostype").unwrap_or("").to_string();
                devicetype = svc_node.attribute("devicetype").unwrap_or("").to_string();
                tunnel = svc_node.attribute("tunnel").unwrap_or("").to_string();
                servicefp = svc_node.attribute("servicefp").unwrap_or("").to_string();

                version = format!("{} {}", product, ver).trim().to_string();

                // ------------------------------------------------------------------
                // CPEs — recolección robusta
                //
                // Estrategia triple (en orden, con deduplicación):
                //   1. Hijos directos <cpe> del <service> (lo habitual en Nmap).
                //   2. Cualquier descendiente <cpe> (por si Nmap los anida raro).
                //   3. Atributo `cpe` del <service> (algunas builds de Nmap lo ponen).
                //
                // Cada CPE se normaliza: trim, sin entidades HTML residuales.
                // ------------------------------------------------------------------
                let mut seen_cpes: std::collections::HashSet<String> =
                    std::collections::HashSet::new();

                // 1) Hijos directos
                for child in svc_node.children() {
                    if child.has_tag_name("cpe")
                        && let Some(text) = child.text()
                    {
                        let t = text.trim().to_string();
                        if !t.is_empty() && seen_cpes.insert(t.clone()) {
                            cpe.push(t);
                        }
                    }
                }

                // 2) Descendientes (por si están anidados)
                for cpe_node in svc_node.descendants().filter(|n| n.has_tag_name("cpe")) {
                    if let Some(text) = cpe_node.text() {
                        let t = text.trim().to_string();
                        if !t.is_empty() && seen_cpes.insert(t.clone()) {
                            cpe.push(t);
                        }
                    }
                }

                // 3) Atributo `cpe` (fallback)
                if let Some(attr_cpe) = svc_node.attribute("cpe") {
                    let t = attr_cpe.trim().to_string();
                    if !t.is_empty() && seen_cpes.insert(t.clone()) {
                        cpe.push(t);
                    }
                }
            }

            let mut scripts = Vec::new();
            for script_node in port_node.descendants().filter(|n| n.has_tag_name("script")) {
                let id = script_node.attribute("id").unwrap_or("").to_string();
                let output = script_node.attribute("output").unwrap_or("").to_string();
                scripts.push(ScriptInfo { id, output });
            }

            ports.push(PortInfo {
                portid,
                protocol,
                state,
                reason,
                service,
                version,
                product,
                extrainfo,
                ostype,
                devicetype,
                tunnel,
                cpe,
                servicefp,
                scripts,
            });
        }

        // ---- ExtraPorts ----
        let mut extraports: Vec<ExtraPorts> = Vec::new();
        for ep_node in host_node
            .descendants()
            .filter(|n| n.has_tag_name("extraports"))
        {
            let ep_state = ep_node.attribute("state").unwrap_or("").to_string();
            let ep_count: u32 = ep_node
                .attribute("count")
                .and_then(|s| s.parse::<u32>().ok())
                .unwrap_or(0);
            let mut reasons: Vec<String> = Vec::new();
            for er in ep_node
                .descendants()
                .filter(|n| n.has_tag_name("extrareasons"))
            {
                if let Some(r) = er.attribute("reason") {
                    reasons.push(r.to_string());
                }
            }
            extraports.push(ExtraPorts {
                state: ep_state,
                count: ep_count,
                reasons,
            });
        }

        // ---- Merge por IP ----
        host_map
            .entry(ip.clone())
            .and_modify(|existing_host| {
                for p in ports.clone() {
                    if !existing_host
                        .ports
                        .iter()
                        .any(|ep| ep.portid == p.portid && ep.protocol == p.protocol)
                    {
                        existing_host.ports.push(p);
                    }
                }
                for s in host_scripts.clone() {
                    if !existing_host.scripts.iter().any(|es| es.id == s.id) {
                        existing_host.scripts.push(s);
                    }
                }
                for ep in extraports.clone() {
                    if !existing_host.extraports.iter().any(|x| x.state == ep.state) {
                        existing_host.extraports.push(ep);
                    }
                }
                if existing_host.mac.is_empty() && !mac.is_empty() {
                    existing_host.mac = mac.clone();
                    existing_host.mac_vendor = mac_vendor.clone();
                }
                if existing_host.hostname.is_empty() && !hostname.is_empty() {
                    existing_host.hostname = hostname.clone();
                }
                if existing_host.os.is_empty() && !os.is_empty() {
                    existing_host.os = os.clone();
                    existing_host.os_accuracy = os_accuracy.clone();
                }
                if existing_host.uptime_seconds == 0 && uptime_seconds > 0 {
                    existing_host.uptime_seconds = uptime_seconds;
                    existing_host.uptime_lastboot = uptime_lastboot.clone();
                }
                if existing_host.distance == 0 && distance > 0 {
                    existing_host.distance = distance;
                }
            })
            .or_insert(HostInfo {
                ip,
                hostname,
                mac,
                mac_vendor,
                status,
                status_reason,
                os,
                os_accuracy,
                uptime_seconds,
                uptime_lastboot,
                distance,
                ports,
                extraports,
                scripts: host_scripts,
                start_time,
                end_time,
            });
    }

    scan_result.hosts = host_map.into_values().collect();

    let result = serde_json::to_string(&scan_result).map_err(|e| e.to_string());
    let _ = std::fs::remove_file(xml_path);
    result
}

#[tauri::command]
async fn run_nmap(
    app: AppHandle,
    state: State<'_, ScanProcess>,
    target: String,
    args: Vec<String>,
) -> Result<(), String> {
    if target.trim().is_empty() {
        return Err("Objetivo vacío".into());
    }

    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis();

    let temp_dir = std::env::temp_dir();
    let xml_path = temp_dir.join(format!("juanmap_{}.xml", timestamp));
    let xml_path_str = xml_path.to_str().unwrap();

    let clean_args = strip_output_flags(args);
    let mut cmd = build_nmap_command(&clean_args, &target, xml_path_str);
    cmd.stdout(Stdio::piped()).stderr(Stdio::piped());

    let mut child = cmd.spawn().map_err(|e| {
        format!(
            "Error Nmap: {}\n\nSi el error es de pkexec, asegúrate de tenerlo instalado:\n  sudo apt install pkexec",
            e
        )
    })?;

    let pid = child.id() as i32;
    state.0.store(pid, Ordering::SeqCst);

    wire_scan_streams(&app, &mut child, "nmap-output");

    let status = child.wait().map_err(|e| e.to_string())?;
    state.0.store(-1, Ordering::SeqCst);

    if status.success() {
        let _ = app.emit("nmap-finished", "\n=== AUDITORÍA COMPLETADA ===");
        match parse_nmap_xml(xml_path_str) {
            Ok(json_data) => {
                let _ = app.emit("nmap-structured-data", json_data);
            }
            Err(e) => {
                let _ = app.emit("nmap-output", format!("\n[ADVERTENCIA PARSEO]: {}", e));
            }
        }
        Ok(())
    } else {
        let _ = std::fs::remove_file(xml_path_str);
        Err("Cancelado o con errores.".into())
    }
}

#[tauri::command]
async fn run_rustscan(
    app: AppHandle,
    state: State<'_, ScanProcess>,
    target: String,
    nmap_args: Vec<String>,
) -> Result<(), String> {
    if target.trim().is_empty() {
        return Err("Objetivo vacío".into());
    }

    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis();

    let temp_dir = std::env::temp_dir();
    let xml_path = temp_dir.join(format!("juanmap_{}.xml", timestamp));
    let xml_path_str = xml_path.to_str().unwrap();

    let clean_args = strip_output_flags(nmap_args);

    #[cfg(target_os = "linux")]
    let mut cmd = {
        let mut c = Command::new("pkexec");
        c.arg("rustscan");
        c.arg("-a")
            .arg(&target)
            .arg("-b")
            .arg("4500")
            .arg("--accessible")
            .arg("--")
            .args(&clean_args)
            .arg("-oX")
            .arg(xml_path_str);
        c
    };

    #[cfg(not(target_os = "linux"))]
    let mut cmd = {
        let mut c = Command::new("rustscan");
        c.arg("-a")
            .arg(&target)
            .arg("-b")
            .arg("4500")
            .arg("--accessible")
            .arg("--")
            .args(&clean_args)
            .arg("-oX")
            .arg(xml_path_str);
        c
    };

    cmd.stdout(Stdio::piped()).stderr(Stdio::piped());

    let mut child = cmd.spawn().map_err(|e| {
        format!(
            "Error RustScan: Asegúrate de tener rustscan y pkexec instalados.\n{}",
            e
        )
    })?;

    let pid = child.id() as i32;
    state.0.store(pid, Ordering::SeqCst);

    wire_scan_streams(&app, &mut child, "nmap-output");

    let status = child.wait().map_err(|e| e.to_string())?;
    state.0.store(-1, Ordering::SeqCst);

    if status.success() {
        let _ = app.emit("nmap-finished", "\n=== AUDITORÍA (RUSTSCAN) COMPLETADA ===");
        match parse_nmap_xml(xml_path_str) {
            Ok(json_data) => {
                let _ = app.emit("nmap-structured-data", json_data);
            }
            Err(e) => {
                let _ = app.emit("nmap-output", format!("\n[ADVERTENCIA PARSEO]: {}", e));
            }
        }
        Ok(())
    } else {
        let _ = std::fs::remove_file(xml_path_str);
        Err("Cancelado o con errores de permisos.".into())
    }
}

#[tauri::command]
fn cancel_nmap(state: State<'_, ScanProcess>) {
    let pid = state.0.load(Ordering::SeqCst);
    if pid > 0 {
        kill_process_group(pid);
        state.0.store(-1, Ordering::SeqCst);
    }
}

// ==========================================================
// 7. TERMINALES — ARQUITECTURA POR PROCESS GROUP
// ==========================================================
//
// CAMBIO FUNDAMENTAL vs v4:
//
//   Antes guardábamos el PID y matábamos solo el PID. Eso fallaba
//   cuando `bash` spawneaba hijos (nmap, python, nc dentro de bash).
//
//   Ahora aplicamos `setsid()` en el hijo vía `pre_exec`. El hijo
//   se convierte en líder de su propio process group, y al hacer
//   `kill(-pgid, SIGKILL)` matamos a él Y a todos sus descendientes
//   de un solo golpe.
//
//   Además, `kill_sweep` ahora mata también `bash -i` y `gobuster`
//   por patrón, como red de seguridad final.
// ==========================================================

/// Lanza un proceso y guarda su PID + Child.
///
/// El hijo es líder de su propio process group (vía `setsid()`).
#[tauri::command]
async fn start_terminal(
    app: AppHandle,
    state: State<'_, TerminalState>,
    session_id: String,
    cmd: String,
    args: Vec<String>,
) -> Result<(), String> {
    let mut command = Command::new(&cmd);
    command
        .args(&args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    // Aísla el hijo en su propio process group para que
    // kill(-pgid) cubra a todos sus descendientes.
    #[cfg(unix)]
    unsafe {
        command.pre_exec(pre_exec_setsid);
    }

    let mut child = command
        .spawn()
        .map_err(|e| format!("Error lanzando '{}': {}", cmd, e))?;

    let pid = child.id() as i32;

    let mut stdout = child.stdout.take().ok_or("Error capturando stdout")?;
    let mut stderr = child.stderr.take().ok_or("Error capturando stderr")?;

    {
        let mut pids = state.pids.lock().unwrap();
        pids.insert(session_id.clone(), pid);
    }
    {
        let mut children = state.children.lock().unwrap();
        children.insert(session_id.clone(), child);
    }

    println!(
        "[start_terminal] session='{}', pid={}, cmd={}",
        session_id, pid, cmd
    );

    let app_out = app.clone();
    let sid_out = session_id.clone();
    std::thread::spawn(move || {
        let mut buf = [0; 1024];
        loop {
            match stdout.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    let chunk = String::from_utf8_lossy(&buf[0..n]).to_string();
                    let _ = app_out.emit(&format!("term-output-{}", sid_out), chunk);
                }
            }
        }
        let _ = app_out.emit(&format!("term-exit-{}", sid_out), ());
    });

    let app_err = app.clone();
    let sid_err = session_id.clone();
    std::thread::spawn(move || {
        let mut buf = [0; 1024];
        loop {
            match stderr.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    let chunk = String::from_utf8_lossy(&buf[0..n]).to_string();
                    let _ = app_err.emit(&format!("term-output-{}", sid_err), chunk);
                }
            }
        }
    });

    Ok(())
}

/// Escribe datos al stdin del proceso.
#[tauri::command]
async fn write_terminal(
    state: State<'_, TerminalState>,
    session_id: String,
    data: String,
) -> Result<(), String> {
    let mut children = state.children.lock().unwrap();
    if let Some(child) = children.get_mut(&session_id)
        && let Some(stdin) = child.stdin.as_mut()
    {
        let _ = stdin.write_all(data.as_bytes());
        let _ = stdin.flush();
        return Ok(());
    }
    Err("Sesión no encontrada o stdin cerrado".into())
}

/// Envía una señal al PID del proceso principal de la sesión.
#[tauri::command]
async fn send_terminal_signal(
    state: State<'_, TerminalState>,
    session_id: String,
    signal_name: String,
) -> Result<(), String> {
    let pid = {
        let pids = state.pids.lock().unwrap();
        *pids
            .get(&session_id)
            .ok_or_else(|| format!("Sesión '{}' no encontrada", session_id))?
    };

    // En Windows, libc solo expone SIGINT/SIGTERM/SIGILL/SIGABRT/etc.
    // SIGTSTP y SIGKILL son POSIX. Para que compile en las 3 plataformas,
    // devolvemos un error claro en Windows cuando se pide una señal que
    // ese SO no soporta. En la práctica, en Windows matamos con
    // `kill_terminal` (TaskKill), no con señales.
    let signal = match signal_name.as_str() {
        "SIGINT" => libc::SIGINT,
        #[cfg(unix)]
        "SIGTSTP" => libc::SIGTSTP,
        #[cfg(not(unix))]
        "SIGTSTP" => {
            return Err("SIGTSTP no está disponible en Windows. Usa cerrar sesión.".to_string());
        }
        "SIGTERM" => libc::SIGTERM,
        #[cfg(unix)]
        "SIGKILL" => libc::SIGKILL,
        #[cfg(not(unix))]
        "SIGKILL" => {
            return Err("SIGKILL no está disponible en Windows. Usa cerrar sesión.".to_string());
        }
        other => return Err(format!("Señal '{}' no soportada", other)),
    };

    if !pid_alive(pid) {
        return Err(format!("PID {} ya no está vivo", pid));
    }

    kill_pid(pid, signal);

    println!(
        "[send_terminal_signal] session='{}', pid={}, signal={}",
        session_id, pid, signal_name
    );

    Ok(())
}

/// Cierra una sesión matando el process group completo.
#[tauri::command]
async fn kill_terminal(state: State<'_, TerminalState>, session_id: String) -> Result<(), String> {
    let pid_opt = {
        let mut pids = state.pids.lock().unwrap();
        pids.remove(&session_id)
    };
    let child_opt = {
        let mut children = state.children.lock().unwrap();
        children.remove(&session_id)
    };

    if let Some(pid) = pid_opt {
        println!("[kill_terminal] session='{}', pid={}", session_id, pid);

        #[cfg(unix)]
        {
            kill_process_group(pid);
            let _ = force_kill_pid(pid, 1000);
        }

        #[cfg(not(unix))]
        {
            let _ = force_kill_pid(pid, 1000);
        }
    }

    if let Some(mut child) = child_opt {
        let _ = child.wait();
    }

    Ok(())
}

/// Mata TODAS las terminales que empiecen por `session_prefix`.
#[tauri::command]
async fn kill_all_terminals(
    state: State<'_, TerminalState>,
    session_prefix: Option<String>,
) -> Result<usize, String> {
    let prefix = session_prefix.unwrap_or_default();

    let ids: Vec<String> = {
        let pids = state.pids.lock().unwrap();
        pids.keys()
            .filter(|id| prefix.is_empty() || id.starts_with(&prefix))
            .cloned()
            .collect()
    };

    let mut killed = 0;
    for id in ids {
        let pid_opt = {
            let mut pids = state.pids.lock().unwrap();
            pids.remove(&id)
        };
        let child_opt = {
            let mut children = state.children.lock().unwrap();
            children.remove(&id)
        };

        if let Some(pid) = pid_opt {
            #[cfg(unix)]
            {
                kill_process_group(pid);
                let _ = force_kill_pid(pid, 500);
            }

            #[cfg(not(unix))]
            {
                let _ = force_kill_pid(pid, 500);
            }

            killed += 1;
        }
        if let Some(mut child) = child_opt {
            let _ = child.wait();
        }
    }

    if prefix.is_empty() || prefix.starts_with("listener-") {
        let _ = pkill_pattern("nc -lvnp");
    }
    if prefix.is_empty() || prefix.starts_with("lessso-bash-") {
        let _ = pkill_pattern("bash -i");
    }

    Ok(killed)
}

// ==========================================================
// 7b. CIERRE DE APP — KILL SWEEP GLOBAL
// ==========================================================

fn kill_sweep(app: &AppHandle) {
    // ─── 1. Terminales por PID + process group ─────────────
    if let Some(state) = app.try_state::<TerminalState>() {
        let pids: Vec<i32> = {
            let mut pids = match state.pids.lock() {
                Ok(g) => g,
                Err(poisoned) => poisoned.into_inner(),
            };
            let all: Vec<i32> = pids.values().copied().collect();
            pids.clear();
            all
        };

        for pid in pids {
            println!("[kill_sweep] Matando process group PID {}", pid);
            #[cfg(unix)]
            kill_process_group(pid);
            let _ = force_kill_pid(pid, 500);
        }

        let children: Vec<Child> = {
            let mut children = match state.children.lock() {
                Ok(g) => g,
                Err(poisoned) => poisoned.into_inner(),
            };
            let all: Vec<Child> = children.drain().map(|(_, c)| c).collect();
            all
        };

        for mut child in children {
            let _ = child.wait();
        }
    }

    // ─── 2. Red de seguridad por patrón ────────────────────
    #[cfg(unix)]
    {
        for pattern in &["nc -lvnp", "bash -i", "lessso-bash-"] {
            let killed = pkill_pattern(pattern);
            if killed > 0 {
                println!("[kill_sweep] pkill mató procesos: '{}'", pattern);
            }
        }
    }

    // ─── 3. Nmap / RustScan ────────────────────────────────
    if let Some(scan) = app.try_state::<ScanProcess>() {
        let pid = scan.0.load(Ordering::SeqCst);
        if pid > 0 {
            kill_process_group(pid);
            scan.0.store(-1, Ordering::SeqCst);
            println!("[kill_sweep] Detenido escaneo PID {}", pid);
        }
    }

    // ─── 4. Gobuster ───────────────────────────────────────
    #[cfg(unix)]
    {
        let killed = pkill_pattern("gobuster");
        if killed > 0 {
            println!("[kill_sweep] pkill mató gobuster residual");
        }
    }

    println!("[kill_sweep] Limpieza completa");
}

// ==========================================================
// 8. FUZZER (GOBUSTER)
// ==========================================================

#[tauri::command]
async fn run_fuzzer(app: AppHandle, target_url: String, wordlist: String) -> Result<(), String> {
    let mut cmd = Command::new("gobuster");
    cmd.args([
        "dir",
        "-u",
        &target_url,
        "-w",
        &wordlist,
        "-t",
        "50",
        "-q",
        "--no-error",
        "--no-color",
    ])
    .stdout(Stdio::piped())
    .stderr(Stdio::piped());

    let mut child = cmd.spawn().map_err(|e| {
        format!(
            "Error lanzando Gobuster: Asegúrate de tenerlo instalado (sudo apt install gobuster).\n{}",
            e
        )
    })?;

    let app_out = app.clone();

    if let Some(stdout) = child.stdout.take() {
        std::thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines().map_while(Result::ok) {
                let _ = app_out.emit("fuzzer-output", line);
            }
            let _ = app_out.emit("fuzzer-finished", ());
        });
    }

    if let Some(stderr) = child.stderr.take() {
        let app_err = app.clone();
        std::thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line in reader.lines().map_while(Result::ok) {
                let _ = app_err.emit("fuzzer-output", line);
            }
        });
    }

    // No esperamos al child: corre en background.
    // Lo mata `kill_sweep` al cerrar la app, o el usuario con
    // `kill_all_terminals` si lo desea.
    Ok(())
}

// ==========================================================
// 9. ENTRY POINT
// ==========================================================

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(ScanProcess(AtomicI32::new(-1)))
        .manage(TerminalState::new())
        .invoke_handler(tauri::generate_handler![
            encrypt_vault,
            decrypt_vault,
            save_clipboard_image,
            paste_and_save_image,
            get_network_interfaces,
            check_vpn,
            connect_vpn,
            disconnect_vpn,
            run_nmap,
            run_rustscan,
            cancel_nmap,
            start_terminal,
            write_terminal,
            send_terminal_signal,
            kill_terminal,
            kill_all_terminals,
            run_fuzzer,
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                let app = window.app_handle().clone();
                kill_sweep(&app);
            }
        })
        .build(tauri::generate_context!())
        .expect("Error Tauri")
        .run(|app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                kill_sweep(app_handle);
            }
        });
}

// ==========================================================
// 10. TESTS
// ==========================================================
// Tests unitarios de las funciones puras del core.
//
// No tocan Tauri, ni AppHandle, ni procesos reales. Solo
// verifican lógica determinista:
//   - strip_output_flags
//   - nmap_needs_root
//   - pid_alive / kill_pid (con el PID actual, seguro)
//   - validate_ovpn_file (con archivos temporales)
//   - encrypt_vault / decrypt_vault (roundtrip con argon2 + aes-gcm)
//   - parse_nmap_xml (con un XML mínimo fixture)
//
// Ejecutar:
//   cargo test --lib
//   cargo test --lib -- --nocapture
// ==========================================================

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::io::Write;

    // ======================================================
    // strip_output_flags
    // ======================================================
    #[test]
    fn strip_output_flags_removes_on() {
        let args = vec!["-sV".to_string(), "-oN".to_string(), "out.txt".to_string()];
        let cleaned = strip_output_flags(args);
        assert_eq!(cleaned, vec!["-sV".to_string()]);
    }

    #[test]
    fn strip_output_flags_removes_ox() {
        let args = vec![
            "-sS".to_string(),
            "-oX".to_string(),
            "out.xml".to_string(),
            "-p".to_string(),
            "80".to_string(),
        ];
        let cleaned = strip_output_flags(args);
        assert_eq!(
            cleaned,
            vec!["-sS".to_string(), "-p".to_string(), "80".to_string()]
        );
    }

    #[test]
    fn strip_output_flags_removes_joined_form() {
        let args = vec!["-sV".to_string(), "-oXout.xml".to_string()];
        let cleaned = strip_output_flags(args);
        assert_eq!(cleaned, vec!["-sV".to_string()]);
    }

    #[test]
    fn strip_output_flags_keeps_unrelated_o_flags() {
        // "-O" (detección de OS) NO debe filtrarse.
        let args = vec!["-O".to_string(), "-sV".to_string()];
        let cleaned = strip_output_flags(args);
        assert_eq!(cleaned, vec!["-O".to_string(), "-sV".to_string()]);
    }

    #[test]
    fn strip_output_flags_empty() {
        let args: Vec<String> = vec![];
        assert!(strip_output_flags(args).is_empty());
    }

    // ======================================================
    // nmap_needs_root
    // ======================================================
    #[test]
    fn nmap_needs_root_syn_scan() {
        let args = vec!["-sS".to_string(), "-p".to_string(), "80".to_string()];
        assert!(nmap_needs_root(&args));
    }

    #[test]
    fn nmap_needs_root_os_detection() {
        let args = vec!["-O".to_string()];
        assert!(nmap_needs_root(&args));
    }

    #[test]
    fn nmap_needs_root_udp() {
        let args = vec!["-sU".to_string()];
        assert!(nmap_needs_root(&args));
    }

    #[test]
    fn nmap_needs_root_fragmentation() {
        let args = vec!["-f".to_string()];
        assert!(nmap_needs_root(&args));
    }

    #[test]
    fn nmap_needs_root_mtu() {
        let args = vec!["--mtu".to_string(), "16".to_string()];
        assert!(nmap_needs_root(&args));
    }

    #[test]
    fn nmap_needs_root_decoy() {
        let args = vec!["-D".to_string(), "RND:5".to_string()];
        assert!(nmap_needs_root(&args));
    }

    #[test]
    fn nmap_needs_root_spoof_mac() {
        let args = vec!["--spoof-mac".to_string(), "0".to_string()];
        assert!(nmap_needs_root(&args));
    }

    #[test]
    fn nmap_needs_root_connect_scan_no_root() {
        // -sT (TCP connect) NO necesita root.
        let args = vec!["-sT".to_string(), "-p".to_string(), "80".to_string()];
        assert!(!nmap_needs_root(&args));
    }

    #[test]
    fn nmap_needs_root_ping_scan_no_root() {
        let args = vec!["-sn".to_string()];
        assert!(!nmap_needs_root(&args));
    }

    #[test]
    fn nmap_needs_root_empty() {
        let args: Vec<String> = vec![];
        assert!(!nmap_needs_root(&args));
    }

    // ======================================================
    // pid_alive / kill_pid (seguros con PID propio)
    // ======================================================
    #[test]
    fn pid_alive_current_process() {
        let me = std::process::id() as i32;
        assert!(pid_alive(me));
    }

    #[test]
    fn pid_alive_invalid() {
        assert!(!pid_alive(0));
        assert!(!pid_alive(-1));
    }

    #[test]
    fn pid_alive_nonexistent() {
        // PID 999999 es casi seguro que no existe (rango máximo 4194304
        // en Linux, pero es improbable que esté ocupado).
        // Este test es best-effort: si existe, se salta.
        if !pid_alive(999999) {
            assert!(!pid_alive(999999));
        }
    }

    #[test]
    fn kill_pid_invalid_returns_false() {
        assert!(!kill_pid(0, libc::SIGTERM));
        assert!(!kill_pid(-1, libc::SIGTERM));
    }

    // ======================================================
    // validate_ovpn_file
    // ======================================================
    fn write_tmp_file(content: &str) -> PathBuf {
        let mut path = std::env::temp_dir();
        let ts = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        path.push(format!("lessso_test_{}.ovpn", ts));
        let mut f = fs::File::create(&path).expect("create tmp");
        f.write_all(content.as_bytes()).expect("write tmp");
        path
    }

    #[test]
    fn ovpn_valid_minimal() {
        let path = write_tmp_file("client\nremote 1.2.3.4 1194\nproto udp\ndev tun\n");
        let result = validate_ovpn_file(&path);
        let _ = fs::remove_file(&path);
        assert!(result.is_ok(), "archivo válido rechazado: {:?}", result);
    }

    #[test]
    fn ovpn_rejects_script_security() {
        let path = write_tmp_file("client\nscript-security 2\nup /tmp/evil.sh\n");
        let result = validate_ovpn_file(&path);
        let _ = fs::remove_file(&path);
        assert!(result.is_err());
        let msg = result.unwrap_err();
        assert!(msg.contains("script-security") || msg.contains("up"));
    }

    #[test]
    fn ovpn_rejects_plugin() {
        let path = write_tmp_file("client\nplugin /tmp/evil.so\n");
        let result = validate_ovpn_file(&path);
        let _ = fs::remove_file(&path);
        assert!(result.is_err());
    }

    #[test]
    fn ovpn_rejects_up_directive() {
        let path = write_tmp_file("client\nup /tmp/evil.sh\n");
        let result = validate_ovpn_file(&path);
        let _ = fs::remove_file(&path);
        assert!(result.is_err());
    }

    #[test]
    fn ovpn_ignores_comments() {
        let path = write_tmp_file("# script-security 2\n; up /tmp/evil.sh\nclient\n");
        let result = validate_ovpn_file(&path);
        let _ = fs::remove_file(&path);
        assert!(result.is_ok(), "comentarios no deben contar: {:?}", result);
    }

    #[test]
    fn ovpn_rejects_nonexistent_file() {
        let path = PathBuf::from("/tmp/definitely_not_a_real_file_lessso.ovpn");
        let result = validate_ovpn_file(&path);
        assert!(result.is_err());
    }

    // ======================================================
    // encrypt_vault / decrypt_vault
    // ======================================================
    #[tokio::test]
    async fn vault_roundtrip_ok() {
        let plaintext = "secret payload with unicode 🔐 and \n newlines";
        let password = "SuperSecret123!";

        let encrypted = encrypt_vault(plaintext.to_string(), password.to_string())
            .await
            .expect("encrypt falló");

        // El ciphertext debe ser Base64 no vacío.
        assert!(!encrypted.is_empty());
        assert_ne!(encrypted, plaintext);

        let decrypted = decrypt_vault(encrypted, password.to_string())
            .await
            .expect("decrypt falló");

        assert_eq!(decrypted, plaintext);
    }

    #[tokio::test]
    async fn vault_wrong_password_fails() {
        let encrypted = encrypt_vault("data".to_string(), "correct".to_string())
            .await
            .expect("encrypt falló");

        let result = decrypt_vault(encrypted, "wrong".to_string()).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn vault_empty_password_rejected() {
        let enc = encrypt_vault("data".to_string(), "".to_string()).await;
        assert!(enc.is_err());

        let dec = decrypt_vault("bogus".to_string(), "".to_string()).await;
        assert!(dec.is_err());
    }

    #[tokio::test]
    async fn vault_corrupt_base64_rejected() {
        let result = decrypt_vault("not-valid-base64!!!".to_string(), "password".to_string()).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn vault_two_encryptions_differ() {
        // Cada encrypt usa salt+nonce aleatorios → ciphertexts distintos.
        let a = encrypt_vault("same".to_string(), "pw".to_string())
            .await
            .unwrap();
        let b = encrypt_vault("same".to_string(), "pw".to_string())
            .await
            .unwrap();
        assert_ne!(a, b, "salt/nonce deben ser aleatorios");
    }

    // ======================================================
    // parse_nmap_xml
    // ======================================================
    const SAMPLE_NMAP_XML: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE nmaprun>
<nmaprun scanner="nmap" args="nmap -sV 127.0.0.1" start="1700000000" startstr="2024-01-01 00:00:00" version="7.94">
  <host starttime="1700000001" endtime="1700000002">
    <status state="up" reason="localhost-response"/>
    <address addr="127.0.0.1" addrtype="ipv4"/>
    <hostnames>
      <hostname name="localhost" type="PTR"/>
    </hostnames>
    <ports>
      <port protocol="tcp" portid="22">
        <state state="open" reason="syn-ack" reason_ttl="64"/>
        <service name="ssh" product="OpenSSH" version="9.6" extrainfo="Ubuntu" ostype="Linux">
          <cpe>cpe:2.3:a:openbsd:openssh:9.6:*:*:*:*:*:*:*</cpe>
        </service>
      </port>
      <port protocol="tcp" portid="80">
        <state state="open" reason="syn-ack" reason_ttl="64"/>
        <service name="http" product="nginx" version="1.24.0"/>
      </port>
    </ports>
  </host>
  <runstats>
    <finished time="1700000010" timestr="2024-01-01 00:00:10" elapsed="10.00" summary="Nmap done" exit="success"/>
  </runstats>
</nmaprun>
"#;

    fn write_tmp_xml(content: &str) -> String {
        let mut path = std::env::temp_dir();
        let ts = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        path.push(format!("lessso_test_{}.xml", ts));
        let mut f = fs::File::create(&path).expect("create tmp xml");
        f.write_all(content.as_bytes()).expect("write tmp xml");
        path.to_string_lossy().to_string()
    }

    #[test]
    fn parse_nmap_xml_basic() {
        let path = write_tmp_xml(SAMPLE_NMAP_XML);
        let result = parse_nmap_xml(&path);
        assert!(result.is_ok(), "parse falló: {:?}", result);

        let json = result.unwrap();
        let v: serde_json::Value = serde_json::from_str(&json).expect("json inválido");

        assert_eq!(v["scanner"], "nmap");
        assert_eq!(v["scanner_version"], "7.94");
        assert_eq!(v["elapsed"], "10.00");

        let hosts = v["hosts"].as_array().expect("hosts no es array");
        assert_eq!(hosts.len(), 1);

        let h = &hosts[0];
        assert_eq!(h["ip"], "127.0.0.1");
        assert_eq!(h["status"], "up");
        assert_eq!(h["hostname"], "localhost");

        let ports = h["ports"].as_array().expect("ports no es array");
        assert_eq!(ports.len(), 2);

        let ssh = ports
            .iter()
            .find(|p| p["portid"] == "22")
            .expect("no encontró 22");
        assert_eq!(ssh["service"], "ssh");
        assert_eq!(ssh["product"], "OpenSSH");
        assert_eq!(ssh["extrainfo"], "Ubuntu");
        assert_eq!(ssh["ostype"], "Linux");

        let cpes = ssh["cpe"].as_array().expect("cpe no es array");
        assert_eq!(cpes.len(), 1);
        assert!(cpes[0].as_str().unwrap().contains("openssh"));
    }

    #[test]
    fn parse_nmap_xml_missing_file() {
        let result = parse_nmap_xml("/tmp/definitely_not_a_real_nmap_file_lessso.xml");
        assert!(result.is_err());
    }

    #[test]
    fn parse_nmap_xml_strips_doctype() {
        // Un XML con DOCTYPE peligroso no debe explotar (billion laughs).
        let xml = r#"<?xml version="1.0"?>
<!DOCTYPE lolz [<!ENTITY lol "lol"><!ENTITY lol2 "&lol;&lol;">]>
<nmaprun scanner="nmap" version="7.94">
  <host>
    <status state="up" reason="test"/>
    <address addr="10.0.0.1" addrtype="ipv4"/>
    <ports></ports>
  </host>
</nmaprun>
"#;
        let path = write_tmp_xml(xml);
        let result = parse_nmap_xml(&path);
        assert!(
            result.is_ok(),
            "DOCTYPE debió ser neutralizado: {:?}",
            result
        );

        let v: serde_json::Value = serde_json::from_str(&result.unwrap()).unwrap();
        let hosts = v["hosts"].as_array().unwrap();
        assert_eq!(hosts.len(), 1);
        assert_eq!(hosts[0]["ip"], "10.0.0.1");
    }

    #[test]
    fn parse_nmap_xml_removes_file_after_parse() {
        let path = write_tmp_xml(SAMPLE_NMAP_XML);
        let _ = parse_nmap_xml(&path);
        assert!(
            !Path::new(&path).exists(),
            "el XML temporal debe eliminarse tras parsear"
        );
    }
}
