// ==========================================================
// LESSSO C2 — Backend Tauri (Atomizado)
// ==========================================================

pub mod commands;
pub mod core;

use crate::core::state::{ScanProcess, TerminalState};
use std::sync::atomic::AtomicI32;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        // Inicialización de Estados Globales
        .manage(ScanProcess(AtomicI32::new(-1)))
        .manage(TerminalState::new())
        // Registro de Comandos Atomizados
        .invoke_handler(tauri::generate_handler![
            // Crypto
            commands::crypto::encrypt_vault,
            commands::crypto::decrypt_vault,
            // System (Clipboard/Screenshots)
            commands::system::save_clipboard_image,
            commands::system::paste_and_save_image,
            // VPN / Network
            commands::vpn::get_network_interfaces,
            commands::vpn::check_vpn,
            commands::vpn::connect_vpn,
            commands::vpn::disconnect_vpn,
            // Escáner (Nmap/Rustscan)
            commands::nmap::run_nmap,
            commands::nmap::run_rustscan,
            commands::nmap::cancel_nmap,
            // Terminales y Process Groups
            commands::terminal::start_terminal,
            commands::terminal::write_terminal,
            commands::terminal::send_terminal_signal,
            commands::terminal::kill_terminal,
            commands::terminal::kill_all_terminals,
            // Fuzzer
            commands::fuzzer::run_fuzzer,
        ])
        // Cleanup al cerrar ventanas
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                let app = window.app_handle().clone();
                commands::terminal::kill_sweep(&app);
            }
        })
        .build(tauri::generate_context!())
        .expect("Error al inicializar Tauri")
        // Cleanup al matar el proceso (Ctrl+C en la consola madre)
        .run(|app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                commands::terminal::kill_sweep(app_handle);
            }
        });
}
