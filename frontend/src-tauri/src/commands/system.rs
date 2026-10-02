use base64::{Engine as _, engine::general_purpose};
use std::path::PathBuf;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

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
pub async fn save_clipboard_image(app: AppHandle, base64_data: String) -> Result<String, String> {
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
pub async fn paste_and_save_image(app: AppHandle) -> Result<String, String> {
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
