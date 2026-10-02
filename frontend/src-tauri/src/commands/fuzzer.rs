use std::io::{BufRead, BufReader};
use std::process::{Command, Stdio};
use tauri::{AppHandle, Emitter};

#[tauri::command]
pub async fn run_fuzzer(
    app: AppHandle,
    target_url: String,
    wordlist: String,
) -> Result<(), String> {
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

    Ok(())
}
