use std::path::Path;
use std::process::Command;

#[tauri::command]
pub async fn get_network_interfaces() -> Result<Vec<String>, String> {
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
pub async fn check_vpn() -> Result<String, String> {
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
pub async fn connect_vpn(ovpn_path: String) -> Result<(), String> {
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
pub async fn disconnect_vpn() -> Result<(), String> {
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
