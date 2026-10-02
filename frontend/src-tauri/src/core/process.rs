use std::io::{BufRead, BufReader};
use std::process::{Child, Command};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

#[cfg(unix)]
pub fn pid_alive(pid: i32) -> bool {
    if pid <= 0 {
        return false;
    }
    unsafe { libc::kill(pid, 0) == 0 }
}

#[cfg(not(unix))]
pub fn pid_alive(_pid: i32) -> bool {
    false
}

#[cfg(unix)]
pub fn kill_pid(pid: i32, signal: i32) -> bool {
    if pid <= 0 {
        return false;
    }
    unsafe { libc::kill(pid, signal) == 0 }
}

#[cfg(not(unix))]
pub fn kill_pid(_pid: i32, _signal: i32) -> bool {
    false
}

#[cfg(unix)]
pub fn force_kill_pid(pid: i32, timeout_ms: u64) -> bool {
    if pid <= 0 {
        return true;
    }
    if !pid_alive(pid) {
        return true;
    }

    kill_pid(pid, libc::SIGTERM);

    let steps = timeout_ms / 50;
    for _ in 0..steps {
        std::thread::sleep(Duration::from_millis(50));
        if !pid_alive(pid) {
            return true;
        }
    }

    kill_pid(pid, libc::SIGKILL);

    for _ in 0..10 {
        std::thread::sleep(Duration::from_millis(50));
        if !pid_alive(pid) {
            return true;
        }
    }

    false
}

#[cfg(not(unix))]
pub fn force_kill_pid(_pid: i32, _timeout_ms: u64) -> bool {
    true
}

#[cfg(unix)]
pub fn kill_process_group(pgid: i32) {
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
pub fn kill_process_group(pgid: i32) {
    if pgid > 0 {
        let _ = Command::new("taskkill")
            .args(["/F", "/T", "/PID", &pgid.to_string()])
            .output();
    }
}

#[cfg(unix)]
pub fn pre_exec_setsid() -> std::io::Result<()> {
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

#[cfg(unix)]
pub fn pkill_pattern(pattern: &str) -> usize {
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
pub fn pkill_pattern(_pattern: &str) -> usize {
    0
}

pub fn wire_scan_streams(app: &AppHandle, child: &mut Child, event_name: &str) {
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
