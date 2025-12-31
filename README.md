# ReBook

## Demo: JRR Tolkien reading The Lord of the Rings
https://github.com/user-attachments/assets/701227ed-024c-4c3e-87ab-a232767810a3


## Setup
Copy .env.example to .env. Then add your Eleven Labs or Minimax keys. Unfortunately Eleven Labs requires a paid plan to use voice cloning. Local model running is on the roadmap!

Run:
```
cargo tauri dev
```

## Reading a Book

**Book import:**
For now, only ```.epub``` formats are supported. ```PDF``` and ```mobi``` support is on the way!

**Voice creation:** You can simply start playing a video of a person speaking aloud, and click record to create a voice.