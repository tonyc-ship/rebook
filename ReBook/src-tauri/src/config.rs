use std::env;

pub fn load_env() {
    let _ = dotenvy::dotenv();
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
