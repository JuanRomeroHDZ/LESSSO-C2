use std::process::{Command, Stdio};
use std::io::{BufRead, BufReader};
use std::sync::atomic::{AtomicU32, Ordering};
use std::collections::HashMap;
use tauri::{AppHandle, Emitter, State};

struct ScanProcess(AtomicU32);

#[derive(serde::Serialize, Clone)]
struct PortInfo { portid: String, protocol: String, state: String, reason: String, service: String, version: String }

#[derive(serde::Serialize, Clone)]
struct HostInfo { ip: String, mac: String, mac_vendor: String, status: String, os: String, ports: Vec<PortInfo> }

#[derive(serde::Serialize)]
struct ScanResult { hosts: Vec<HostInfo> }

fn parse_nmap_xml(xml_path: &str) -> Result<String, String> {
    if !std::path::Path::new(xml_path).exists() { return Err("XML no generado.".into()); }
    let xml_text = std::fs::read_to_string(xml_path).map_err(|e| e.to_string())?;
    
    let safe_xml = xml_text.replace("<!DOCTYPE nmaprun>", "");
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

        let status = host_node.descendants().find(|n| n.has_tag_name("status")).and_then(|n| n.attribute("state")).unwrap_or("unknown").to_string();
        let mut os = String::new();
        if let Some(os_match) = host_node.descendants().find(|n| n.has_tag_name("osmatch")) { os = os_match.attribute("name").unwrap_or("").to_string(); }

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
            ports.push(PortInfo { portid, protocol, state, reason, service, version });
        }

        host_map.entry(ip.clone()).and_modify(|existing_host| {
            for p in ports.clone() { if !existing_host.ports.iter().any(|ep| ep.portid == p.portid) { existing_host.ports.push(p); } }
            if existing_host.mac.is_empty() && !mac.is_empty() { existing_host.mac = mac.clone(); existing_host.mac_vendor = mac_vendor.clone(); }
        }).or_insert(HostInfo { ip, mac, mac_vendor, status, os, ports });
    }
    
    let hosts: Vec<HostInfo> = host_map.into_values().collect();
    serde_json::to_string(&ScanResult { hosts }).map_err(|e| e.to_string())
}

#[tauri::command]
async fn run_nmap(app: AppHandle, state: State<'_, ScanProcess>, target: String, args: Vec<String>) -> Result<(), String> {
    if target.is_empty() { return Err("Objetivo vacío".into()); }
    
    // Genera una ruta temporal segura cross-platform
    let temp_dir = std::env::temp_dir();
    let xml_path = temp_dir.join("juanmap_latest.xml");
    let xml_path_str = xml_path.to_str().unwrap();

    // Llama a "nmap" desde el PATH del sistema operativo (evita rutas quemadas)
    let mut cmd = Command::new("nmap");
    cmd.args(args)
       .arg("-oX")
       .arg(xml_path_str)
       .arg(&target)
       .stdout(Stdio::piped())
       .stderr(Stdio::piped());
    
    let mut child = cmd.spawn().map_err(|e| format!("Error Nmap (Asegúrate de que nmap esté instalado en tu sistema): {}", e))?;
    state.0.store(child.id(), Ordering::SeqCst);

    if let Some(stdout) = child.stdout.take() {
        let reader = BufReader::new(stdout);
        for line in reader.lines().flatten() { let _ = app.emit("nmap-output", line); }
    }

    let status = child.wait().map_err(|e| e.to_string())?;
    state.0.store(0, Ordering::SeqCst);

    if status.success() {
        let _ = app.emit("nmap-finished", "\n=== AUDITORÍA COMPLETADA ===");
        match parse_nmap_xml(xml_path_str) {
            Ok(json_data) => { let _ = app.emit("nmap-structured-data", json_data); },
            Err(e) => { let _ = app.emit("nmap-output", format!("\n[ADVERTENCIA PARSEO]: {}", e)); }
        }
        Ok(())
    } else { Err("Cancelado o con errores.".into()) }
}

#[tauri::command]
fn cancel_nmap(state: State<'_, ScanProcess>) {
    let pid = state.0.load(Ordering::SeqCst);
    if pid != 0 { let _ = Command::new("kill").arg("-9").arg(pid.to_string()).output(); state.0.store(0, Ordering::SeqCst); }
}

#[tauri::command]
async fn run_nmap_tool(tool: String, arg: String) -> Result<String, String> {
    let mut cmd = Command::new("nmap");
    if tool == "iflist" { cmd.arg("--iflist"); }  
    else if tool == "script-help" { cmd.arg("--script-help").arg(arg); }  
    else { return Err("Herramienta no soportada".into()); }

    let output = cmd.output().map_err(|e| e.to_string())?;
    if output.status.success() { Ok(String::from_utf8_lossy(&output.stdout).to_string()) }  
    else { Err(String::from_utf8_lossy(&output.stderr).to_string()) }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init()) // Plugin de notificaciones
        .manage(ScanProcess(AtomicU32::new(0)))
        .invoke_handler(tauri::generate_handler![run_nmap, cancel_nmap, run_nmap_tool])
        .run(tauri::generate_context!())
        .expect("Error Tauri");
}
