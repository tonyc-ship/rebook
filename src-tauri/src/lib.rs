mod config;
mod epub;
mod elevenlabs;
mod minimax;
mod models;
mod tts;

use crate::models::{
    AudioClip, Book, BookEntry, ElevenLabsCloneRequest, ElevenLabsCloneResponse,
    MinimaxCloneRequest, MinimaxCloneResponse, MinimaxUploadRequest, MinimaxUploadResponse,
    TtsRequest,
};
use std::fs;

#[tauri::command]
fn parse_epub(base64: String) -> Result<Book, String> {
    epub::parse_epub(base64)
}

#[tauri::command]
fn save_library(app: tauri::AppHandle, library: Vec<BookEntry>) -> Result<(), String> {
    let path = config::get_library_path(&app)?;
    let json = serde_json::to_string(&library)
        .map_err(|e| format!("Failed to serialize library: {}", e))?;
    fs::write(path, json)
        .map_err(|e| format!("Failed to write library file: {}", e))?;
    Ok(())
}

#[tauri::command]
fn load_library(app: tauri::AppHandle) -> Result<Vec<BookEntry>, String> {
    let path = config::get_library_path(&app)?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let json = fs::read_to_string(path)
        .map_err(|e| format!("Failed to read library file: {}", e))?;
    let library: Vec<BookEntry> = serde_json::from_str(&json)
        .map_err(|e| format!("Failed to deserialize library: {}", e))?;
    Ok(library)
}

#[tauri::command]
async fn tts_generate(request: TtsRequest) -> Result<AudioClip, String> {
    tts::synthesize(request).await
}

#[tauri::command]
async fn minimax_upload_clone_audio(
    request: MinimaxUploadRequest,
) -> Result<MinimaxUploadResponse, String> {
    minimax::upload_clone_audio(request).await
}

#[tauri::command]
async fn minimax_create_clone(
    request: MinimaxCloneRequest,
) -> Result<MinimaxCloneResponse, String> {
    minimax::create_clone(request).await
}

#[tauri::command]
async fn elevenlabs_create_clone(
    request: ElevenLabsCloneRequest,
) -> Result<ElevenLabsCloneResponse, String> {
    elevenlabs::create_clone(request).await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    config::load_env();
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            parse_epub,
            save_library,
            load_library,
            tts_generate,
            minimax_upload_clone_audio,
            minimax_create_clone,
            elevenlabs_create_clone
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
