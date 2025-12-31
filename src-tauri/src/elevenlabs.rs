use crate::config;
use crate::models::{ElevenLabsCloneRequest, ElevenLabsCloneResponse};
use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use reqwest::multipart::{Form, Part};
use serde::Deserialize;

#[derive(Deserialize)]
struct ElevenLabsVoiceResponse {
    voice_id: String,
    name: Option<String>,
}

pub async fn create_clone(
    request: ElevenLabsCloneRequest,
) -> Result<ElevenLabsCloneResponse, String> {
    let api_key = config::elevenlabs_api_key()
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "Missing REBOOK_ELEVENLABS_API_KEY in environment.".to_string())?;
    let requested_name = request.name.clone();
    let bytes = STANDARD
        .decode(request.audio_base64.as_bytes())
        .map_err(|error| format!("Invalid audio base64: {error}"))?;
    let file_part = Part::bytes(bytes).file_name(request.filename.clone());
    let form = Form::new().text("name", request.name).part("files", file_part);

    let response = reqwest::Client::new()
        .post("https://api.elevenlabs.io/v1/voices/add")
        .header("xi-api-key", api_key)
        .multipart(form)
        .send()
        .await
        .map_err(|error| format!("ElevenLabs clone request failed: {error}"))?;

    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        return Err(format!(
            "ElevenLabs clone returned {}: {}",
            status, body
        ));
    }

    let body: ElevenLabsVoiceResponse = response
        .json()
        .await
        .map_err(|error| format!("ElevenLabs clone parse failed: {error}"))?;

    Ok(ElevenLabsCloneResponse {
        voice_id: body.voice_id,
        name: body.name.unwrap_or(requested_name),
    })
}
