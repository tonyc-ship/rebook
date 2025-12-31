use std::env;
use std::fs;
use std::path::PathBuf;
use tauri::AppHandle;
use tauri::Manager;

pub fn load_env() {
    let _ = dotenvy::dotenv();
}

pub fn get_library_path(app: &AppHandle) -> Result<PathBuf, String> {
    let mut path = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    
    if !path.exists() {
        fs::create_dir_all(&path)
            .map_err(|e| format!("Failed to create app data dir: {}", e))?;
    }
    
    path.push("library.json");
    Ok(path)
}

pub fn external_api_key() -> Option<String> {
    env::var("REBOOK_EXTERNAL_TTS_API_KEY").ok()
}

pub fn minimax_api_key() -> Option<String> {
    env::var("REBOOK_MINIMAX_API_KEY").ok()
}

pub fn elevenlabs_api_key() -> Option<String> {
    env::var("REBOOK_ELEVENLABS_API_KEY").ok()
}
