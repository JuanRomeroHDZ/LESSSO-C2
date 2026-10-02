use std::io::{Read, Write};
use std::process::{Child, Command, Stdio};
use tauri::{AppHandle, Emitter, Manager, State};

#[cfg(unix)]
use std::os::unix::process::CommandExt;

use crate::core::process::*;
use crate::core::state::{ScanProcess, TerminalState};
use std::sync::atomic::Ordering;

#[tauri::command]
pub async fn start_terminal(
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

#[tauri::command]
pub async fn write_terminal(
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

#[tauri::command]
pub async fn send_terminal_signal(
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
    Ok(())
}

#[tauri::command]
pub async fn kill_terminal(state: State<'_, TerminalState>, session_id: String) -> Result<(), String> {
    let pid_opt = {
        let mut pids = state.pids.lock().unwrap();
        pids.remove(&session_id)
    };
    let child_opt = {
        let mut children = state.children.lock().unwrap();
        children.remove(&session_id)
    };

    if let Some(pid) = pid_opt {
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

#[tauri::command]
pub async fn kill_all_terminals(
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

pub fn kill_sweep(app: &AppHandle) {
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

    #[cfg(unix)]
    {
        for pattern in &["nc -lvnp", "bash -i", "lessso-bash-"] {
            let _ = pkill_pattern(pattern);
        }
    }

    if let Some(scan) = app.try_state::<ScanProcess>() {
        let pid = scan.0.load(Ordering::SeqCst);
        if pid > 0 {
            kill_process_group(pid);
            scan.0.store(-1, Ordering::SeqCst);
        }
    }

    #[cfg(unix)]
    {
        let _ = pkill_pattern("gobuster");
    }
}
