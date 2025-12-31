use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Chapter {
    pub id: String,
    pub title: String,
    pub text: String,
    pub word_count: usize,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Book {
    pub title: String,
    pub author: Option<String>,
    pub chapters: Vec<Chapter>,
    pub cover_base64: Option<String>,
    pub cover_mime: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum VoiceMode {
    Neutral,
    External,
    Minimax,
    Elevenlabs,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExternalTtsConfig {
    pub api_base_url: String,
    pub voice_id: Option<String>,
    pub output_format: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TtsRequest {
    pub chapter_id: String,
    pub text: String,
    pub voice_mode: VoiceMode,
    pub external: Option<ExternalTtsConfig>,
    pub minimax: Option<MinimaxTtsConfig>,
    pub elevenlabs: Option<ElevenLabsTtsConfig>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MinimaxTtsConfig {
    pub voice_id: Option<String>,
    pub model: Option<String>,
    pub output_format: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MinimaxUploadRequest {
    pub filename: String,
    pub audio_base64: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MinimaxUploadResponse {
    pub file_id: i64,
    pub filename: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MinimaxCloneRequest {
    pub file_id: i64,
    pub voice_id: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MinimaxCloneResponse {
    pub voice_id: String,
    pub demo_audio: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ElevenLabsTtsConfig {
    pub voice_id: Option<String>,
    pub model: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ElevenLabsCloneRequest {
    pub name: String,
    pub filename: String,
    pub audio_base64: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ElevenLabsCloneResponse {
    pub voice_id: String,
    pub name: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioClip {
    pub chapter_id: String,
    pub audio_base64: String,
    pub mime: String,
}
