use crate::config;
use crate::models::{
    MinimaxCloneRequest, MinimaxCloneResponse, MinimaxUploadRequest, MinimaxUploadResponse,
};
use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use reqwest::multipart::{Form, Part};
use serde::Deserialize;

#[derive(Deserialize)]
struct UploadFileResp {
    file: UploadFileObject,
    base_resp: BaseResp,
}

#[derive(Deserialize)]
struct UploadFileObject {
    file_id: i64,
    filename: String,
}

#[derive(Deserialize)]
struct BaseResp {
    status_code: i64,
    status_msg: Option<String>,
}

#[derive(Deserialize)]
struct VoiceCloneResp {
    demo_audio: Option<String>,
    base_resp: BaseResp,
}

pub async fn upload_clone_audio(
    request: MinimaxUploadRequest,
) -> Result<MinimaxUploadResponse, String> {
    let api_key = config::minimax_api_key()
        .ok_or_else(|| "Missing REBOOK_MINIMAX_API_KEY in environment.".to_string())?;
    let bytes = STANDARD
        .decode(request.audio_base64.as_bytes())
        .map_err(|error| format!("Invalid audio base64: {error}"))?;
    let file_part = Part::bytes(bytes).file_name(request.filename.clone());
    let form = Form::new()
        .text("purpose", "voice_clone")
        .part("file", file_part);

    let client = reqwest::Client::new();
    let response = client
        .post("https://api.minimaxi.com/v1/files/upload")
        .bearer_auth(api_key)
        .multipart(form)
        .send()
        .await
        .map_err(|error| format!("Upload request failed: {error}"))?;

    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        return Err(format!(
            "Upload failed with {}: {}",
            status,
            body
        ));
    }

    let body: UploadFileResp = response
        .json()
        .await
        .map_err(|error| format!("Upload response parse failed: {error}"))?;
    if body.base_resp.status_code != 0 {
        let msg = body
            .base_resp
            .status_msg
            .unwrap_or_else(|| "Upload failed".to_string());
        return Err(msg);
    }

    Ok(MinimaxUploadResponse {
        file_id: body.file.file_id,
        filename: body.file.filename,
    })
}

pub async fn create_clone(
    request: MinimaxCloneRequest,
) -> Result<MinimaxCloneResponse, String> {
    let api_key = config::minimax_api_key()
        .ok_or_else(|| "Missing REBOOK_MINIMAX_API_KEY in environment.".to_string())?;
    let payload = serde_json::json!({
        "file_id": request.file_id,
        "voice_id": request.voice_id,
    });

    let client = reqwest::Client::new();
    let response = client
        .post("https://api.minimaxi.com/v1/voice_clone")
        .bearer_auth(api_key)
        .json(&payload)
        .send()
        .await
        .map_err(|error| format!("Clone request failed: {error}"))?;

    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        return Err(format!(
            "Clone failed with {}: {}",
            status,
            body
        ));
    }

    let body: VoiceCloneResp = response
        .json()
        .await
        .map_err(|error| format!("Clone response parse failed: {error}"))?;
    if body.base_resp.status_code != 0 {
        let msg = body
            .base_resp
            .status_msg
            .unwrap_or_else(|| "Clone failed".to_string());
        return Err(msg);
    }

    Ok(MinimaxCloneResponse {
        voice_id: request.voice_id,
        demo_audio: body.demo_audio,
    })
}
