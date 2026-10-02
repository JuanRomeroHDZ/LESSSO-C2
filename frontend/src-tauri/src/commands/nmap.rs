use std::collections::HashMap;
use std::path::Path;
use std::process::{Command, Stdio};
use std::sync::atomic::Ordering;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, State};

use crate::core::process::{kill_process_group, wire_scan_streams};
use crate::core::state::ScanProcess;

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

fn parse_nmap_xml(xml_path: &str) -> Result<String, String> {
    use roxmltree::Document;

    if !Path::new(xml_path).exists() {
        return Err("XML no generado.".into());
    }

    let xml_text = std::fs::read_to_string(xml_path).map_err(|e| e.to_string())?;

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

    if let Some(runstats) = root.descendants().find(|n| n.has_tag_name("runstats"))
        && let Some(finished) = runstats.descendants().find(|n| n.has_tag_name("finished"))
    {
        scan_result.end_time = finished.attribute("time").unwrap_or("").to_string();
        scan_result.end_time_str = finished.attribute("timestr").unwrap_or("").to_string();
        scan_result.elapsed = finished.attribute("elapsed").unwrap_or("").to_string();
    }

    let mut host_map: HashMap<String, HostInfo> = HashMap::new();

    for host_node in root.descendants().filter(|n| n.has_tag_name("host")) {
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

        let status_node = host_node.descendants().find(|n| n.has_tag_name("status"));
        let status = status_node
            .and_then(|n| n.attribute("state"))
            .unwrap_or("unknown")
            .to_string();
        let status_reason = status_node
            .and_then(|n| n.attribute("reason"))
            .unwrap_or("")
            .to_string();

        let mut os = String::new();
        let mut os_accuracy = String::new();
        if let Some(os_match) = host_node.descendants().find(|n| n.has_tag_name("osmatch")) {
            os = os_match.attribute("name").unwrap_or("").to_string();
            os_accuracy = os_match.attribute("accuracy").unwrap_or("").to_string();
        }

        let mut uptime_seconds: u64 = 0;
        let mut uptime_lastboot = String::new();
        if let Some(up) = host_node.descendants().find(|n| n.has_tag_name("uptime")) {
            uptime_seconds = up
                .attribute("seconds")
                .and_then(|s| s.parse::<u64>().ok())
                .unwrap_or(0);
            uptime_lastboot = up.attribute("lastboot").unwrap_or("").to_string();
        }

        let distance: u32 = host_node
            .descendants()
            .find(|n| n.has_tag_name("distance"))
            .and_then(|n| n.attribute("value"))
            .and_then(|s| s.parse::<u32>().ok())
            .unwrap_or(0);

        let start_time = host_node.attribute("starttime").unwrap_or("").to_string();
        let end_time = host_node.attribute("endtime").unwrap_or("").to_string();

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

                let mut seen_cpes: std::collections::HashSet<String> =
                    std::collections::HashSet::new();

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

                for cpe_node in svc_node.descendants().filter(|n| n.has_tag_name("cpe")) {
                    if let Some(text) = cpe_node.text() {
                        let t = text.trim().to_string();
                        if !t.is_empty() && seen_cpes.insert(t.clone()) {
                            cpe.push(t);
                        }
                    }
                }

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
pub async fn run_nmap(
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
pub async fn run_rustscan(
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
pub fn cancel_nmap(state: State<'_, ScanProcess>) {
    let pid = state.0.load(Ordering::SeqCst);
    if pid > 0 {
        kill_process_group(pid);
        state.0.store(-1, Ordering::SeqCst);
    }
}
