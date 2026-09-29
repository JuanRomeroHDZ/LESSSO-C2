#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::{Command, Stdio};
use std::io::{BufRead, BufReader, Read, Write};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Mutex;
use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, State};
use base64::{engine::general_purpose, Engine as _};

struct ScanProcess(AtomicU32);

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

// NUEVO: Comando para guardar las capturas de pantalla de la Bitácora
#[tauri::command]
async fn save_clipboard_image(base64_data: String) -> Result<String, String> {
    let parts: Vec<&str> = base64_data.split(',').collect();
    if parts.len() != 2 { return Err("Formato Base64 inválido".to_string()); }
    
    let image_data = general_purpose::STANDARD.decode(parts[1])
        .map_err(|e| format!("Error decodificando imagen: {}", e))?;
        
    let timestamp = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis();
    let temp_dir = std::env::temp_dir();
    let file_path = temp_dir.join(format!("lessso_screenshot_{}.png", timestamp));
    
    let mut file = std::fs::File::create(&file_path)
        .map_err(|e| format!("Error creando archivo de imagen: {}", e))?;
    file.write_all(&image_data)
        .map_err(|e| format!("Error escribiendo imagen: {}", e))?;
        
    Ok(file_path.to_string_lossy().to_string())
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
    if target.is_empty() { return Err("Objetivo vacío".into()); }
    let timestamp = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis();
    let temp_dir = std::env::temp_dir();
    let xml_path = temp_dir.join(format!("juanmap_{}.xml", timestamp));
    let xml_path_str = xml_path.to_str().unwrap();

    let mut cmd = Command::new("nmap");
    cmd.args(args).arg("-oX").arg(xml_path_str).arg(&target).stdout(Stdio::piped()).stderr(Stdio::piped());
    
    let mut child = cmd.spawn().map_err(|e| format!("Error Nmap: {}", e))?;
    state.0.store(child.id(), Ordering::SeqCst);

    let app_out = app.clone();
    if let Some(stdout) = child.stdout.take() { std::thread::spawn(move || { let reader = BufReader::new(stdout); for line in reader.lines().flatten() { let _ = app_out.emit("nmap-output", line); } }); }

    let app_err = app.clone();
    if let Some(stderr) = child.stderr.take() { std::thread::spawn(move || { let reader = BufReader::new(stderr); for line in reader.lines().flatten() { let _ = app_err.emit("nmap-output", line); } }); }

    let status = child.wait().map_err(|e| e.to_string())?;
    state.0.store(0, Ordering::SeqCst);

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
    if target.is_empty() { return Err("Objetivo vacío".into()); }
    let timestamp = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis();
    let temp_dir = std::env::temp_dir();
    let xml_path = temp_dir.join(format!("juanmap_{}.xml", timestamp));
    let xml_path_str = xml_path.to_str().unwrap();

    let mut cmd = Command::new("rustscan");
    cmd.arg("-a").arg(&target).arg("-b").arg("4500").arg("--accessible").arg("--");
    cmd.args(nmap_args).arg("-oX").arg(xml_path_str).stdout(Stdio::piped()).stderr(Stdio::piped());
    
    let mut child = cmd.spawn().map_err(|e| format!("Error RustScan: Asegúrate de tener rustscan instalado.\n{}", e))?;
    state.0.store(child.id(), Ordering::SeqCst);

    let app_out = app.clone();
    if let Some(stdout) = child.stdout.take() { std::thread::spawn(move || { let reader = BufReader::new(stdout); for line in reader.lines().flatten() { let _ = app_out.emit("nmap-output", line); } }); }

    let app_err = app.clone();
    if let Some(stderr) = child.stderr.take() { std::thread::spawn(move || { let reader = BufReader::new(stderr); for line in reader.lines().flatten() { let _ = app_err.emit("nmap-output", line); } }); }

    let status = child.wait().map_err(|e| e.to_string())?;
    state.0.store(0, Ordering::SeqCst);

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
    if pid != 0 { let _ = Command::new("kill").arg("-9").arg(pid.to_string()).output(); state.0.store(0, Ordering::SeqCst); }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init()) 
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())  
        .plugin(tauri_plugin_fs::init())      
        .manage(ScanProcess(AtomicU32::new(0)))
        .manage(TerminalState { stdins: Mutex::new(HashMap::new()) })
        // AÑADIDO SAVE_CLIPBOARD_IMAGE AL HANDLER
        .invoke_handler(tauri::generate_handler![run_nmap, run_rustscan, cancel_nmap, check_vpn, connect_vpn, disconnect_vpn, start_terminal, write_terminal, kill_terminal, get_network_interfaces, run_fuzzer, save_clipboard_image])
        .run(tauri::generate_context!())
        .expect("Error Tauri");
}
