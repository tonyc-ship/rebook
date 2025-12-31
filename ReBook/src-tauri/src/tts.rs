use crate::config;
use crate::models::{AudioClip, ExternalTtsConfig, TtsRequest, VoiceMode};
use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use hex::FromHex;
use reqwest::header::CONTENT_TYPE;
use serde::{Deserialize, Serialize};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ExternalTtsPayload<'a> {
    text: &'a str,
    voice_id: Option<&'a str>,
    format: Option<&'a str>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExternalTtsResponse {
    audio_base64: String,
    mime: Option<String>,
}

pub async fn synthesize(request: TtsRequest) -> Result<AudioClip, String> {
    match request.voice_mode {
        VoiceMode::Neutral => Err(
            "Neutral voice uses local playback. Use the Play button for speech synthesis."
                .to_string(),
        ),
        VoiceMode::External => synthesize_external(request).await,
        VoiceMode::Minimax => synthesize_minimax(request).await,
        VoiceMode::Elevenlabs => synthesize_elevenlabs(request).await,
    }
}

async fn synthesize_external(request: TtsRequest) -> Result<AudioClip, String> {
    let external = request
        .external
        .ok_or_else(|| "External voice configuration missing.".to_string())?;
    let url = build_endpoint(&external);
    let payload = ExternalTtsPayload {
        text: &request.text,
        voice_id: external.voice_id.as_deref(),
        format: external.output_format.as_deref(),
    };

    let client = reqwest::Client::new();
    let mut req = client.post(url).json(&payload);
    if let Some(key) = config::external_api_key().as_ref().filter(|value| !value.is_empty()) {
        req = req.bearer_auth(key);
    }

    let response = req
        .send()
        .await
        .map_err(|error| format!("TTS request failed: {error}"))?;

    let status = response.status();
    let content_type = response
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("")
        .to_string();

    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        return Err(format!(
            "TTS service returned {}: {}",
            status,
            body
        ));
    }

    if content_type.starts_with("audio/") {
        let bytes = response
            .bytes()
            .await
            .map_err(|error| format!("Failed reading audio response: {error}"))?;
        return Ok(AudioClip {
            chapter_id: request.chapter_id,
            audio_base64: STANDARD.encode(&bytes),
            mime: content_type,
        });
    }

    let body: ExternalTtsResponse = response
        .json()
        .await
        .map_err(|error| format!("Failed parsing TTS JSON response: {error}"))?;

    Ok(AudioClip {
        chapter_id: request.chapter_id,
        audio_base64: body.audio_base64,
        mime: body.mime.unwrap_or_else(|| "audio/mpeg".to_string()),
    })
}

fn build_endpoint(config: &ExternalTtsConfig) -> String {
    let base = config.api_base_url.trim_end_matches('/');
    format!("{base}/synthesize")
}

#[derive(Serialize)]
struct MinimaxVoiceSetting<'a> {
    voice_id: &'a str,
}

#[derive(Serialize)]
struct MinimaxAudioSetting<'a> {
    format: &'a str,
}

#[derive(Serialize)]
struct MinimaxTtsPayload<'a> {
    model: &'a str,
    text: &'a str,
    stream: bool,
    voice_setting: MinimaxVoiceSetting<'a>,
    audio_setting: MinimaxAudioSetting<'a>,
    output_format: &'a str,
}

#[derive(Deserialize)]
struct MinimaxTtsResponse {
    data: Option<MinimaxTtsData>,
    base_resp: Option<MinimaxBaseResp>,
}

#[derive(Deserialize)]
struct MinimaxTtsData {
    audio: String,
    status: Option<i64>,
}

#[derive(Deserialize)]
struct MinimaxBaseResp {
    status_code: i64,
    status_msg: Option<String>,
}

async fn synthesize_minimax(request: TtsRequest) -> Result<AudioClip, String> {
    let config = request
        .minimax
        .ok_or_else(|| "Minimax configuration missing.".to_string())?;
    let api_key = config::minimax_api_key()
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "Missing REBOOK_MINIMAX_API_KEY in environment.".to_string())?;
    let voice_id = config
        .voice_id
        .as_ref()
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "Minimax voice_id required.".to_string())?;
    let model = config
        .model
        .as_deref()
        .filter(|value| !value.is_empty())
        .unwrap_or("speech-2.6-hd");
    let format = config
        .output_format
        .as_deref()
        .filter(|value| !value.is_empty())
        .unwrap_or("mp3");

    let payload = MinimaxTtsPayload {
        model,
        text: &request.text,
        stream: false,
        voice_setting: MinimaxVoiceSetting { voice_id },
        audio_setting: MinimaxAudioSetting { format },
        output_format: "hex",
    };

    let client = reqwest::Client::new();
    let response = client
        .post("https://api.minimaxi.com/v1/t2a_v2")
        .bearer_auth(api_key)
        .json(&payload)
        .send()
        .await
        .map_err(|error| format!("Minimax TTS request failed: {error}"))?;

    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        return Err(format!(
            "Minimax TTS returned {}: {}",
            status,
            body
        ));
    }

    let body: MinimaxTtsResponse = response
        .json()
        .await
        .map_err(|error| format!("Minimax TTS response parse failed: {error}"))?;
    if let Some(base_resp) = body.base_resp {
        if base_resp.status_code != 0 {
            let msg = base_resp
                .status_msg
                .unwrap_or_else(|| "Minimax TTS failed".to_string());
            return Err(msg);
        }
    }

    let audio_hex = body
        .data
        .ok_or_else(|| "Minimax TTS response missing data.".to_string())?
        .audio;
    let bytes = Vec::from_hex(audio_hex)
        .map_err(|error| format!("Invalid audio hex: {error}"))?;
    let mime = minimax_mime(format);

    Ok(AudioClip {
        chapter_id: request.chapter_id,
        audio_base64: STANDARD.encode(&bytes),
        mime,
    })
}

fn minimax_mime(format: &str) -> String {
    match format {
        "wav" => "audio/wav",
        "flac" => "audio/flac",
        "pcm" => "audio/pcm",
        _ => "audio/mpeg",
    }
    .to_string()
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ElevenLabsTtsPayload<'a> {
    text: &'a str,
    model_id: &'a str,
}

async fn synthesize_elevenlabs(request: TtsRequest) -> Result<AudioClip, String> {
    let config = request
        .elevenlabs
        .ok_or_else(|| "ElevenLabs configuration missing.".to_string())?;
    let api_key = config::elevenlabs_api_key()
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "Missing REBOOK_ELEVENLABS_API_KEY in environment.".to_string())?;
    let voice_id = config
        .voice_id
        .as_ref()
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "ElevenLabs voice_id required.".to_string())?;
    let model_id = config
        .model
        .as_deref()
        .filter(|value| !value.is_empty())
        .unwrap_or("eleven_multilingual_v2");

    let payload = ElevenLabsTtsPayload {
        text: &request.text,
        model_id,
    };
    let url = format!("https://api.elevenlabs.io/v1/text-to-speech/{voice_id}");
    let response = reqwest::Client::new()
        .post(url)
        .header("xi-api-key", api_key)
        .json(&payload)
        .send()
        .await
        .map_err(|error| format!("ElevenLabs TTS request failed: {error}"))?;

    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        return Err(format!("ElevenLabs TTS returned {}: {}", status, body));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|error| format!("ElevenLabs audio read failed: {error}"))?;

    Ok(AudioClip {
        chapter_id: request.chapter_id,
        audio_base64: STANDARD.encode(&bytes),
        mime: "audio/mpeg".to_string(),
    })
}
