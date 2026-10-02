use aes_gcm::{
    Aes256Gcm, Nonce,
    aead::{Aead, KeyInit},
};
use argon2::{Algorithm, Argon2, Params, Version};
use base64::{Engine as _, engine::general_purpose};
use rand::RngCore;
use zeroize::Zeroize;

const VAULT_VERSION: u8 = 0x01;
const SALT_LEN: usize = 16;
const NONCE_LEN: usize = 12;

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
pub async fn encrypt_vault(data: String, password: String) -> Result<String, String> {
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
pub async fn decrypt_vault(encrypted_data: String, password: String) -> Result<String, String> {
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
