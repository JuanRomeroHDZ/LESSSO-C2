#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::{Command, Stdio, Child};
use std::io::{BufRead, BufReader, Read, Write};
use std::sync::atomic::{AtomicI32, Ordering};
use std::sync::Mutex;
use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH, Duration};
use tauri::{AppHandle, Emitter, State, Manager};
use base64::{engine::general_purpose, Engine as _};
use aes_gcm::{aead::{Aead, KeyInit}, Aes256Gcm, Nonce};
use rand::RngCore;
use argon2::{Argon2, Algorithm, Version, Params};
use zeroize::Zeroize;

// ==========================================================
// ESTADO GLOBAL DEL PROCESO DE ESCANEO
// ==========================================================
struct ScanProcess(AtomicI32);

struct TerminalState {
    stdins: Mutex<HashMap<String, std::process::ChildStdin>>,
}

#[derive(serde::Serialize, Clone)]
struct ScriptInfo { id: String, output: String }

#[derive(serde::Serialize, Clone)]
struct PortInfo { portid: String, protocol: String, state: String, reason: String, service: String, version: String, scripts: Vec<ScriptInfo> }

#[derive(serde::Serialize, Clone)]
struct HostInfo { ip: String, hostname: String, mac: String, mac_vendor: String, status: String, os: String, ports: Vec<PortInfo>, scripts: Vec<ScriptInfo> }

#[derive(serde::Serialize)]
struct ScanResult { hosts: Vec<HostInfo> }

// ==========================================================
// HELPER: lanza un proceso en su PROPIO process group (POSIX).
// ==========================================================
#[cfg(unix)]
fn build_process_group_command(program: &str) -> Command {
    let mut cmd = Command::new("setsid");
    cmd.arg(program);
    cmd
}

#[cfg(not(unix))]
fn build_process_group_command(program: &str) -> Command {
    Command::new(program)
}

// ==========================================================
// HELPER: mata un process group entero con SIGTERM → SIGKILL.
// ==========================================================
#[cfg(unix)]
fn kill_process_group(pgid: i32) {
    if pgid <= 0 { return; }

    unsafe {
        libc::kill(-pgid, libc::SIGTERM);
    }

    for _ in 0..20 {
        std::thread::sleep(Duration::from_millis(100));
        let alive = unsafe { libc::kill(-pgid, 0) == 0 };
        if !alive { return; }
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

// ==========================================================
// HELPER: conecta stdout/stderr del child a eventos Tauri.
// ==========================================================
fn wire_scan_streams(app: &AppHandle, child: &mut Child, event_name: &str) {
    if let Some(stdout) = child.stdout.take() {
        let app_out = app.clone();
        let ev = event_name.to_string();
        std::thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines().flatten() {
                let _ = app_out.emit(&ev, line);
            }
        });
    }

    if let Some(stderr) = child.stderr.take() {
        let app_err = app.clone();
        let ev = event_name.to_string();
        std::thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line in reader.lines().flatten() {
                let _ = app_err.emit(&ev, line);
            }
        });
    }
}

// ==========================================================
// MÓDULO DE CIFRADO SEGURO PARA LA BÓVEDA (Sprint 2)
// ----------------------------------------------------------
// - KDF: Argon2id con salt aleatorio de 16 bytes
// - Cifrado: AES-256-GCM con nonce de 12 bytes
// - Formato del blob (Base64):
//     [1 byte version=0x01]
//     [16 bytes salt]
//     [12 bytes nonce]
//     [N bytes ciphertext + tag GCM]
// - La clave derivada se borra de memoria con zeroize.
// - Parámetros Argon2 (recomendación OWASP 2024):
//     m_cost = 19456 KB (~19 MB), t_cost = 2, p_cost = 1
// ==========================================================

const VAULT_VERSION: u8 = 0x01;
const SALT_LEN: usize = 16;
const NONCE_LEN: usize = 12;

/// Deriva una clave AES-256 desde una contraseña usando Argon2id.
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
// DIRECTORIO DE SCREENSHOTS
// ----------------------------------------------------------
// Guardamos las capturas en $APPDATA/screenshots/
// Esto es CRÍTICO para que Tauri pueda exponerlas vía asset://
// (el directorio /tmp NO está dentro del scope permitido).
// ==========================================================
fn screenshots_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let base = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("No se pudo obtener app_data_dir: {}", e))?;

    let dir = base.join("screenshots");
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("No se pudo crear directorio de screenshots: {}", e))?;

    Ok(dir)
}

// ==========================================================
// GUARDAR IMAGEN DEL CLIPBOARD COMO PNG REAL EN DISCO
// ----------------------------------------------------------
// Acepta un data URL (data:image/png;base64,... o data:image/bmp;base64,...)
// y:
//   1. Detecta el tipo real por magic bytes
//   2. Si es BMP, lo convierte a PNG usando la crate `image`
//   3. Lo guarda en $APPDATA/screenshots/
//
// Devuelve la RUTA ABSOLUTA del archivo PNG guardado.
// ==========================================================
#[tauri::command]
async fn save_clipboard_image(app: AppHandle, base64_data: String) -> Result<String, String> {
    // 1. Separar el prefijo del base64
    let parts: Vec<&str> = base64_data.split(',').collect();
    if parts.len() != 2 {
        return Err("Formato Base64 inválido (esperado: data:...;base64,XXXX)".to_string());
    }

    // 2. Decodificar los bytes
    let raw_bytes = general_purpose::STANDARD
        .decode(parts[1])
        .map_err(|e| format!("Error decodificando base64: {}", e))?;

    if raw_bytes.is_empty() {
        return Err("La imagen está vacía".to_string());
    }

    // 3. Detectar tipo por magic bytes y convertir a PNG
    let png_bytes = if raw_bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        // Ya es PNG, no hay que convertir
        raw_bytes
    } else if raw_bytes.starts_with(b"BM") {
        // Es BMP, convertir a PNG
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

    // 4. Guardar en $APPDATA/screenshots/
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis();

    let dir = screenshots_dir(&app)?;
    let file_path = dir.join(format!("capture_{}.png", timestamp));

    std::fs::write(&file_path, &png_bytes)
        .map_err(|e| format!("Error escribiendo PNG: {}", e))?;

    println!(
        "[save_clipboard_image] ✅ Guardado: {} ({} bytes)",
        file_path.display(),
        png_bytes.len()
    );

    Ok(file_path.to_string_lossy().to_string())
}

// ==========================================================
// LEER IMAGEN DEL CLIPBOARD Y GUARDARLA DIRECTAMENTE
// ----------------------------------------------------------
// Este comando combina paste + save en un solo paso, evitando
// que el frontend tenga que manejar data URLs gigantes.
//
// Métodos en cascada:
//   1. arboard (cross-platform)
//   2. wl-paste (Wayland nativo, requiere wl-clipboard)
//   3. xclip (X11/XWayland, requiere xclip)
//
// Devuelve la RUTA del PNG guardado en $APPDATA/screenshots/
// ==========================================================
#[tauri::command]
async fn paste_and_save_image(app: AppHandle) -> Result<String, String> {
    // Intentamos los 3 métodos, cada uno devuelve bytes ya en PNG
    let png_bytes = match try_paste_arboard() {
        Ok(bytes) => {
            println!("[paste] ✅ Imagen leída vía arboard ({} bytes)", bytes.len());
            bytes
        }
        Err(e) => {
            eprintln!("[paste] arboard falló: {}", e);

            match try_paste_wl_paste() {
                Ok(bytes) => {
                    println!("[paste] ✅ Imagen leída vía wl-paste ({} bytes)", bytes.len());
                    bytes
                }
                Err(e) => {
                    eprintln!("[paste] wl-paste falló: {}", e);

                    match try_paste_xclip() {
                        Ok(bytes) => {
                            println!("[paste] ✅ Imagen leída vía xclip ({} bytes)", bytes.len());
                            bytes
                        }
                        Err(e) => {
                            eprintln!("[paste] xclip falló: {}", e);
                            return Err(
                                "No se pudo leer la imagen del portapapeles.\n\n\
                                El portapapeles no contiene una imagen o no hay ningún \
                                gestor compatible disponible.\n\n\
                                En Linux (Wayland), instala uno de estos:\n\
                                  sudo apt install wl-clipboard\n\
                                  sudo apt install xclip\n\n\
                                Y vuelve a intentarlo.".to_string()
                            );
                        }
                    }
                }
            }
        }
    };

    // Guardar en $APPDATA/screenshots/
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis();

    let dir = screenshots_dir(&app)?;
    let file_path = dir.join(format!("capture_{}.png", timestamp));

    std::fs::write(&file_path, &png_bytes)
        .map_err(|e| format!("Error escribiendo PNG: {}", e))?;

    println!(
        "[paste] ✅ Guardado en: {} ({} bytes)",
        file_path.display(),
        png_bytes.len()
    );

    Ok(file_path.to_string_lossy().to_string())
}

// ==========================================================
// MÉTODO 1: arboard (devuelve PNG o BMP ya convertido a PNG)
// ==========================================================
fn try_paste_arboard() -> Result<Vec<u8>, String> {
    use arboard::Clipboard;

    let mut clipboard = Clipboard::new()
        .map_err(|e| format!("arboard: no se pudo acceder: {}", e))?;

    let img = clipboard.get_image()
        .map_err(|e| format!("arboard: {}", e))?;

    let width = img.width as u32;
    let height = img.height as u32;

    if width == 0 || height == 0 {
        return Err("arboard: imagen vacía".to_string());
    }

    // Convertir RGBA a PNG directamente
    use image::{ImageBuffer, RgbaImage, ImageFormat};

    let buffer: RgbaImage = ImageBuffer::from_raw(width, height, img.bytes.to_vec())
        .ok_or_else(|| "arboard: no se pudo crear el buffer".to_string())?;

    let mut png_buffer = Vec::new();
    let mut cursor = std::io::Cursor::new(&mut png_buffer);
    buffer.write_to(&mut cursor, ImageFormat::Png)
        .map_err(|e| format!("arboard: error codificando PNG: {}", e))?;

    Ok(png_buffer)
}

// ==========================================================
// MÉTODO 2: wl-paste (Wayland nativo, devuelve PNG)
// ==========================================================
fn try_paste_wl_paste() -> Result<Vec<u8>, String> {
    // Listar tipos disponibles
    let types_output = Command::new("wl-paste")
        .arg("--list-types")
        .output()
        .map_err(|e| format!("wl-paste: no ejecutable: {}", e))?;

    if !types_output.status.success() {
        return Err("wl-paste: no disponible".to_string());
    }

    let types = String::from_utf8_lossy(&types_output.stdout);
    println!("[wl-paste] Tipos disponibles:\n{}", types);

    // Buscar el mejor tipo de imagen disponible
    let candidates = ["image/png", "image/bmp", "image/x-bmp", "image/jpeg"];
    let chosen_type = candidates.iter()
        .find(|t| types.lines().any(|l| l.trim() == **t))
        .ok_or_else(|| format!("wl-paste: no hay tipo de imagen (disponibles: {})", types.trim()))?;

    println!("[wl-paste] Usando tipo: {}", chosen_type);

    // Leer con el tipo elegido
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

    // Si ya es PNG, devolver tal cual
    if *chosen_type == "image/png" {
        return Ok(output.stdout);
    }

    // Si es BMP/JPEG, convertir a PNG
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

// ==========================================================
// MÉTODO 3: xclip (X11/XWayland)
// ==========================================================
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

#[tauri::command]
async fn get_network_interfaces() -> Result<Vec<String>, String> {
    let output = Command::new("ip").args(["-o", "link", "show"]).output();
    let mut interfaces = Vec::new();
    if let Ok(out) = output {
        if out.status.success() {
            let stdout = String::from_utf8_lossy(&out.stdout);
            for line in stdout.lines() {
                let parts: Vec<&str> = line.split(':').collect();
                if parts.len() > 1 {
                    let iface_name = parts[1].trim();
                    if !iface_name.starts_with("lo") { interfaces.push(iface_name.to_string()); }
                }
            }
            return Ok(interfaces);
        }
    }
    Err("No se pudieron obtener las interfaces".to_string())
}

#[tauri::command]
async fn check_vpn() -> Result<String, String> {
    let output = Command::new("ip").args(["-4", "addr", "show", "tun0"]).output();
    if let Ok(out) = output {
        if out.status.success() {
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
    }
    Err("Desconectado".to_string())
}

#[tauri::command]
async fn connect_vpn(ovpn_path: String) -> Result<(), String> {
    let openvpn_exe = if std::path::Path::new("/usr/sbin/openvpn").exists() { "/usr/sbin/openvpn" }
                      else if std::path::Path::new("/usr/bin/openvpn").exists() { "/usr/bin/openvpn" }
                      else { "openvpn" };
    let output = Command::new("pkexec")
        .arg(openvpn_exe).arg("--config").arg(&ovpn_path).arg("--daemon")
        .output().map_err(|e| format!("DEPENDENCY_MISSING: {}", e))?;
    if !output.status.success() {
        let err_msg = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Autenticación cancelada o fallo de OpenVPN:\n{}", err_msg));
    }
    Ok(())
}

#[tauri::command]
async fn disconnect_vpn() -> Result<(), String> {
    let killall_exe = if std::path::Path::new("/usr/bin/killall").exists() { "/usr/bin/killall" } else { "/bin/killall" };
    let mut child = Command::new("sh")
        .arg("-c").arg(format!("pkexec {} openvpn || sudo {} openvpn || killall openvpn", killall_exe, killall_exe))
        .spawn().map_err(|e| format!("Error cerrando VPN: {}", e))?;
    let _ = child.wait();
    Ok(())
}

#[tauri::command]
async fn run_fuzzer(app: AppHandle, target_url: String, wordlist: String) -> Result<(), String> {
    let mut cmd = Command::new("gobuster");
    cmd.args(["dir", "-u", &target_url, "-w", &wordlist, "-t", "50", "-q", "--no-error", "--no-color"])
       .stdout(Stdio::piped()).stderr(Stdio::piped());

    let mut child = cmd.spawn().map_err(|e| format!("Error lanzando Gobuster: Asegúrate de tenerlo instalado (sudo apt install gobuster).\n{}", e))?;
    let app_out = app.clone();

    if let Some(stdout) = child.stdout.take() {
        std::thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines().flatten() { let _ = app_out.emit("fuzzer-output", line); }
            let _ = app_out.emit("fuzzer-finished", ());
        });
    }
    Ok(())
}

// ==========================================================
// HELPER: elimina cualquier flag de output (-oN/-oG/-oX/-oA/-oS)
// ==========================================================
fn strip_output_flags(args: Vec<String>) -> Vec<String> {
    let mut result = Vec::with_capacity(args.len());
    let mut skip_next = false;
    for arg in args {
        if skip_next { skip_next = false; continue; }
        if matches!(arg.as_str(), "-oN" | "-oG" | "-oX" | "-oA" | "-oS" | "-o") {
            skip_next = true;
            continue;
        }
        if arg.starts_with("-o") && arg.len() > 2 &&
           matches!(&arg[0..3], "-oN" | "-oG" | "-oX" | "-oA" | "-oS") {
            continue;
        }
        result.push(arg);
    }
    result
}

// ==========================================================
// HELPER: detecta si Nmap requiere root para los args dados.
// ==========================================================
fn nmap_needs_root(args: &[String]) -> bool {
    for arg in args {
        if matches!(arg.as_str(),
            "-sS" | "-sU" | "-sY" | "-sI" | "-sA" | "-sW" | "-sM" |
            "-O" | "--osscan-guess" |
            "-f" | "--mtu" | "-D" | "--spoof-mac" |
            "-S" | "-g" | "--badsum" |
            "--scanflags"
        ) {
            return true;
        }
        if arg.starts_with("-s") && arg.len() == 3 {
            let flag = &arg[1..];
            if matches!(flag, "sS" | "sU" | "sY" | "sI" | "sA" | "sW" | "sM") {
                return true;
            }
        }
        if arg.starts_with("--mtu") || arg.starts_with("--spoof-mac") ||
           arg.starts_with("--scanflags") {
            return true;
        }
    }
    false
}

// ==========================================================
// HELPER: construye el comando de Nmap, con o sin pkexec.
// ==========================================================
fn build_nmap_command(clean_args: &[String], target: &str, xml_path: &str) -> Command {
    #[cfg(target_os = "linux")]
    {
        if nmap_needs_root(clean_args) {
            let mut cmd = Command::new("pkexec");
            cmd.arg("setsid");
            cmd.arg("nmap");
            cmd.args(clean_args);
            cmd.arg("-oX").arg(xml_path);
            cmd.arg(target);
            return cmd;
        }
    }

    let mut cmd = build_process_group_command("nmap");
    cmd.args(clean_args);
    cmd.arg("-oX").arg(xml_path);
    cmd.arg(target);
    cmd
}

fn parse_nmap_xml(xml_path: &str) -> Result<String, String> {
    if !std::path::Path::new(xml_path).exists() { return Err("XML no generado.".into()); }
    let xml_text = std::fs::read_to_string(xml_path).map_err(|e| e.to_string())?;
    let mut safe_xml = xml_text.clone();
    if let Some(start) = safe_xml.find("<!DOCTYPE") {
        if let Some(end_offset) = safe_xml[start..].find('>') { safe_xml.replace_range(start..=start + end_offset, ""); }
    }
    let doc = roxmltree::Document::parse(&safe_xml).map_err(|e| format!("Error de parseo XML: {}", e))?;
    let mut host_map: HashMap<String, HostInfo> = HashMap::new();

    for host_node in doc.descendants().filter(|n| n.has_tag_name("host")) {
        let mut ip = String::new(); let mut mac = String::new(); let mut mac_vendor = String::new();
        for addr in host_node.descendants().filter(|n| n.has_tag_name("address")) {
            let addrtype = addr.attribute("addrtype").unwrap_or("");
            let addr_val = addr.attribute("addr").unwrap_or("").to_string();
            if addrtype == "ipv4" || addrtype == "ipv6" { ip = addr_val; }
            else if addrtype == "mac" { mac = addr_val; mac_vendor = addr.attribute("vendor").unwrap_or("").to_string(); }
        }
        if ip.is_empty() { continue; }

        let mut hostnames = Vec::new();
        if let Some(hns_node) = host_node.descendants().find(|n| n.has_tag_name("hostnames")) {
            for hn_node in hns_node.descendants().filter(|n| n.has_tag_name("hostname")) {
                if let Some(name) = hn_node.attribute("name") { hostnames.push(name.to_string()); }
            }
        }
        let hostname = hostnames.join(", ");
        let status = host_node.descendants().find(|n| n.has_tag_name("status")).and_then(|n| n.attribute("state")).unwrap_or("unknown").to_string();
        let mut os = String::new();
        if let Some(os_match) = host_node.descendants().find(|n| n.has_tag_name("osmatch")) { os = os_match.attribute("name").unwrap_or("").to_string(); }

        let mut host_scripts = Vec::new();
        if let Some(hostscript_node) = host_node.descendants().find(|n| n.has_tag_name("hostscript")) {
            for script_node in hostscript_node.descendants().filter(|n| n.has_tag_name("script")) {
                let id = script_node.attribute("id").unwrap_or("").to_string();
                let output = script_node.attribute("output").unwrap_or("").to_string();
                host_scripts.push(ScriptInfo { id, output });
            }
        }

        let mut ports = Vec::new();
        for port_node in host_node.descendants().filter(|n| n.has_tag_name("port")) {
            let portid = port_node.attribute("portid").unwrap_or("").to_string();
            let protocol = port_node.attribute("protocol").unwrap_or("").to_string();
            let state_node = port_node.descendants().find(|n| n.has_tag_name("state"));
            let state = state_node.and_then(|n| n.attribute("state")).unwrap_or("unknown").to_string();
            let reason = state_node.and_then(|n| n.attribute("reason")).unwrap_or("").to_string();

            let mut service = String::new(); let mut version = String::new();
            if let Some(svc_node) = port_node.descendants().find(|n| n.has_tag_name("service")) {
                service = svc_node.attribute("name").unwrap_or("").to_string();
                version = format!("{} {}", svc_node.attribute("product").unwrap_or(""), svc_node.attribute("version").unwrap_or("")).trim().to_string();
            }

            let mut scripts = Vec::new();
            for script_node in port_node.descendants().filter(|n| n.has_tag_name("script")) {
                let id = script_node.attribute("id").unwrap_or("").to_string();
                let output = script_node.attribute("output").unwrap_or("").to_string();
                scripts.push(ScriptInfo { id, output });
            }
            ports.push(PortInfo { portid, protocol, state, reason, service, version, scripts });
        }

        host_map.entry(ip.clone()).and_modify(|existing_host| {
            for p in ports.clone() { if !existing_host.ports.iter().any(|ep| ep.portid == p.portid) { existing_host.ports.push(p); } }
            for s in host_scripts.clone() { if !existing_host.scripts.iter().any(|es| es.id == s.id) { existing_host.scripts.push(s); } }
            if existing_host.mac.is_empty() && !mac.is_empty() { existing_host.mac = mac.clone(); existing_host.mac_vendor = mac_vendor.clone(); }
            if existing_host.hostname.is_empty() && !hostname.is_empty() { existing_host.hostname = hostname.clone(); }
        }).or_insert(HostInfo { ip, hostname, mac, mac_vendor, status, os, ports, scripts: host_scripts });
    }

    let hosts: Vec<HostInfo> = host_map.into_values().collect();
    let result = serde_json::to_string(&ScanResult { hosts }).map_err(|e| e.to_string());
    let _ = std::fs::remove_file(xml_path);
    result
}

#[tauri::command]
async fn start_terminal(app: AppHandle, state: State<'_, TerminalState>, session_id: String, cmd: String, args: Vec<String>) -> Result<(), String> {
    let mut command = Command::new(&cmd);
    command.args(args).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped());
    let mut child = command.spawn().map_err(|e| format!("Error lanzando comando: {}", e))?;

    let stdin = child.stdin.take().ok_or("Error capturando stdin")?;
    state.stdins.lock().unwrap().insert(session_id.clone(), stdin);

    let mut stdout = child.stdout.take().ok_or("Error capturando stdout")?;
    let mut stderr = child.stderr.take().ok_or("Error capturando stderr")?;

    let app_out = app.clone(); let sid_out = session_id.clone();
    std::thread::spawn(move || {
        let mut buf = [0; 1024];
        loop { match stdout.read(&mut buf) { Ok(0) | Err(_) => break, Ok(n) => { let chunk = String::from_utf8_lossy(&buf[0..n]).to_string(); let _ = app_out.emit(&format!("term-output-{}", sid_out), chunk); } } }
    });

    let app_err = app.clone(); let sid_err = session_id.clone();
    std::thread::spawn(move || {
        let mut buf = [0; 1024];
        loop { match stderr.read(&mut buf) { Ok(0) | Err(_) => break, Ok(n) => { let chunk = String::from_utf8_lossy(&buf[0..n]).to_string(); let _ = app_err.emit(&format!("term-output-{}", sid_err), chunk); } } }
    });

    let sid_exit = session_id.clone();
    std::thread::spawn(move || { let _ = child.wait(); let _ = app.emit(&format!("term-exit-{}", sid_exit), ()); });
    Ok(())
}

#[tauri::command]
async fn write_terminal(state: State<'_, TerminalState>, session_id: String, data: String) -> Result<(), String> {
    if let Some(stdin) = state.stdins.lock().unwrap().get_mut(&session_id) { let _ = stdin.write_all(data.as_bytes()); let _ = stdin.flush(); Ok(()) } else { Err("Sesión no encontrada".into()) }
}

#[tauri::command]
async fn kill_terminal(state: State<'_, TerminalState>, session_id: String) -> Result<(), String> {
    state.stdins.lock().unwrap().remove(&session_id); Ok(())
}

#[tauri::command]
async fn run_nmap(app: AppHandle, state: State<'_, ScanProcess>, target: String, args: Vec<String>) -> Result<(), String> {
    if target.trim().is_empty() { return Err("Objetivo vacío".into()); }
    let timestamp = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis();
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
            Ok(json_data) => { let _ = app.emit("nmap-structured-data", json_data); },
            Err(e) => { let _ = app.emit("nmap-output", format!("\n[ADVERTENCIA PARSEO]: {}", e)); }
        }
        Ok(())
    } else {
        let _ = std::fs::remove_file(xml_path_str);
        Err("Cancelado o con errores.".into())
    }
}

#[tauri::command]
async fn run_rustscan(app: AppHandle, state: State<'_, ScanProcess>, target: String, nmap_args: Vec<String>) -> Result<(), String> {
    if target.trim().is_empty() { return Err("Objetivo vacío".into()); }
    let timestamp = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis();
    let temp_dir = std::env::temp_dir();
    let xml_path = temp_dir.join(format!("juanmap_{}.xml", timestamp));
    let xml_path_str = xml_path.to_str().unwrap();

    let clean_args = strip_output_flags(nmap_args);

    #[cfg(target_os = "linux")]
    let mut cmd = {
        let mut c = Command::new("pkexec");
        c.arg("setsid");
        c.arg("rustscan");
        c.arg("-a").arg(&target)
         .arg("-b").arg("4500")
         .arg("--accessible")
         .arg("--")
         .args(&clean_args)
         .arg("-oX").arg(xml_path_str);
        c
    };

    #[cfg(not(target_os = "linux"))]
    let mut cmd = {
        let mut c = build_process_group_command("rustscan");
        c.arg("-a").arg(&target)
         .arg("-b").arg("4500")
         .arg("--accessible")
         .arg("--")
         .args(&clean_args)
         .arg("-oX").arg(xml_path_str);
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
            Ok(json_data) => { let _ = app.emit("nmap-structured-data", json_data); },
            Err(e) => { let _ = app.emit("nmap-output", format!("\n[ADVERTENCIA PARSEO]: {}", e)); }
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

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(ScanProcess(AtomicI32::new(-1)))
        .manage(TerminalState { stdins: Mutex::new(HashMap::new()) })
        .invoke_handler(tauri::generate_handler![
            run_nmap, run_rustscan, cancel_nmap, check_vpn, connect_vpn, disconnect_vpn,
            start_terminal, write_terminal, kill_terminal, get_network_interfaces,
            run_fuzzer, save_clipboard_image, encrypt_vault, decrypt_vault,
            paste_and_save_image
        ])
        .run(tauri::generate_context!())
        .expect("Error Tauri");
}
