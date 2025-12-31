const { invoke } = window.__TAURI__.core;

const state = {
  book: null,
  library: [],
  voiceMode: "minimax",
  minimaxConfig: {
    model: "speech-2.6-hd",
  },
  minimaxVoices: [],
  elevenlabsConfig: {
    voiceName: "",
    model: "eleven_multilingual_v2",
  },
  elevenlabsVoices: [],
  activeVoice: null,
  activeBookId: null,
  activeAudio: null,
  reader: {
    pages: [],
    pageIndex: 0,
    sentences: [],
    sentenceIndex: 0,
    sentencePageMap: [],
    isPlaying: false,
    isAdvancing: false,
    prefetchQueue: [],
    isPrefetching: false,
  },
  ui: {
    leftCollapsed: false,
    rightCollapsed: false,
  },
  recording: {
    isRecording: false,
    mediaRecorder: null,
    audioChunks: [],
    stream: null,
    duration: 0,
    timerInterval: null,
  },
  playback: {
    audio: null,
    audioUrl: null,
    isPlaying: false,
    duration: 0,
    currentTime: 0,
  }
};

const selectors = {
  appStatus: "#app-status",
  epubInput: "#epub-input",
  bookGrid: "#book-grid",
  importTrigger: "#import-trigger",
  readerTitle: "#reader-title",
  readerMeta: "#reader-meta",
  voiceList: "#voice-list",
  voiceCreateToggle: "#voice-create-toggle",
  voiceCreate: "#voice-create",
  voiceProvider: "#voice-provider",
  voiceName: "#voice-name",
  voiceFileInput: "#voice-file",
  voiceFileName: "#voice-file-name",
  voiceClone: "#voice-clone",
  readerText: "#reader-text",
  readerPrev: "#reader-prev",
  readerNext: "#reader-next",
  readerPlay: "#reader-play",
  toggleLeft: "#toggle-left",
  toggleRight: "#toggle-right",
  leftPanel: "#left-panel",
  rightPanel: "#right-panel",
  activeVoiceAvatar: "#active-voice-avatar",
  activeVoiceName: "#active-voice-name",
  activeVoiceProvider: "#active-voice-provider",
  playbackProgressFill: "#playback-progress-fill",
  voiceRecordBtn: "#voice-record-btn",
  recordBtnText: "#record-btn-text",
  voicePlaybackBtn: "#voice-playback-btn",
  playbackIcon: "#playback-icon",
  playbackTime: "#playback-time",
};

const statusPill = document.querySelector(selectors.appStatus);
const epubInput = document.querySelector(selectors.epubInput);
const bookGrid = document.querySelector(selectors.bookGrid);
const importTrigger = document.querySelector(selectors.importTrigger);
const readerTitle = document.querySelector(selectors.readerTitle);
const readerMeta = document.querySelector(selectors.readerMeta);
const voiceList = document.querySelector(selectors.voiceList);
const voiceCreateToggle = document.querySelector(selectors.voiceCreateToggle);
const voiceCreate = document.querySelector(selectors.voiceCreate);
const voiceProvider = document.querySelector(selectors.voiceProvider);
const voiceNameInput = document.querySelector(selectors.voiceName);
const voiceFileInput = document.querySelector(selectors.voiceFileInput);
const voiceFileName = document.querySelector(selectors.voiceFileName);
const voiceCloneButton = document.querySelector(selectors.voiceClone);
const readerText = document.querySelector(selectors.readerText);
const readerPrev = document.querySelector(selectors.readerPrev);
const readerNext = document.querySelector(selectors.readerNext);
const readerPlay = document.querySelector(selectors.readerPlay);
const toggleLeftBtn = document.querySelector(selectors.toggleLeft);
const toggleRightBtn = document.querySelector(selectors.toggleRight);
const leftPanel = document.querySelector(selectors.leftPanel);
const rightPanel = document.querySelector(selectors.rightPanel);
const activeVoiceAvatar = document.querySelector(selectors.activeVoiceAvatar);
const activeVoiceName = document.querySelector(selectors.activeVoiceName);
const activeVoiceProvider = document.querySelector(selectors.activeVoiceProvider);
const playbackProgressFill = document.querySelector(selectors.playbackProgressFill);
const voiceRecordBtn = document.querySelector(selectors.voiceRecordBtn);
const recordBtnText = document.querySelector(selectors.recordBtnText);
const voicePlaybackBtn = document.querySelector(selectors.voicePlaybackBtn);
const playbackIcon = document.querySelector(selectors.playbackIcon);
const playbackTimeLabel = document.querySelector(selectors.playbackTime);

function setStatus(text, tone = "idle") {
  // Status bar removed as per user request.
  // We only show a spinner during voice creation.
  console.log(`Status [${tone}]: ${text}`);
}

function resetPlayback() {
  if (state.activeAudio) {
    state.activeAudio.pause();
    state.activeAudio.currentTime = 0;
    state.activeAudio = null;
  }
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") {
        const parts = result.split("base64,");
        if (parts.length === 2) {
          resolve(parts[1]);
          return;
        }
      }
      reject(new Error("Unable to read file as base64."));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") {
        const parts = result.split("base64,");
        if (parts.length === 2) {
          resolve(parts[1]);
          return;
        }
      }
      reject(new Error("Unable to convert blob to base64."));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ 
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 1,
        sampleRate: 44100
      } 
    });
    state.recording.stream = stream;
    state.recording.isRecording = true;
    state.recording.audioChunks = [];
    state.recording.duration = 0;

    const mediaRecorder = new MediaRecorder(stream, {
      mimeType: 'audio/webm;codecs=opus'
    });

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        state.recording.audioChunks.push(event.data);
      }
    };

    mediaRecorder.onstop = async () => {
      if (state.recording.timerInterval) {
        clearInterval(state.recording.timerInterval);
        state.recording.timerInterval = null;
      }
      
      const audioBlob = new Blob(state.recording.audioChunks, { type: 'audio/webm;codecs=opus' });
      
      // Convert to WAV format for better compatibility
      const wavBlob = await convertWebmToWav(audioBlob);
      
      // Store audio for playback
      setupPlayback(wavBlob);
      
      // Create a File object from the blob
      const audioFile = new File([wavBlob], 'recording.wav', { type: 'audio/wav' });
      
      // Update the file input (create a DataTransfer to simulate file selection)
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(audioFile);
      voiceFileInput.files = dataTransfer.files;
      
      // Trigger change event
      voiceFileInput.dispatchEvent(new Event('change', { bubbles: true }));
      
      // Update UI
      voiceFileName.textContent = 'Recording.wav';
      recordBtnText.textContent = 'Record';
      state.recording.isRecording = false;
      
      // Stop all tracks
      state.recording.stream.getTracks().forEach(track => track.stop());
      state.recording.stream = null;
    };

    mediaRecorder.start();
    state.recording.mediaRecorder = mediaRecorder;
    
    // Start timer
    state.recording.timerInterval = setInterval(() => {
      state.recording.duration++;
      recordBtnText.textContent = `Stop (${formatTime(state.recording.duration)})`;
    }, 1000);

    // Update UI
    recordBtnText.textContent = `Stop (0:00)`;
    voiceRecordBtn.classList.add('recording');
    voiceFileName.textContent = 'Recording...';
  } catch (error) {
    console.error('Error starting recording:', error);
    alert('Failed to access microphone. Please check permissions.');
    state.recording.isRecording = false;
    recordBtnText.textContent = 'Record';
  }
}

function stopRecording() {
  if (state.recording.mediaRecorder && state.recording.isRecording) {
    state.recording.mediaRecorder.stop();
    voiceRecordBtn.classList.remove('recording');
  }
}

async function convertWebmToWav(webmBlob) {
  // For simplicity, we'll use the Web Audio API to convert
  // This is a basic conversion - in production you might want to use a library like lamejs for MP3
  const arrayBuffer = await webmBlob.arrayBuffer();
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
  
  // Convert to WAV
  const wav = audioBufferToWav(audioBuffer);
  return new Blob([wav], { type: 'audio/wav' });
}

function audioBufferToWav(buffer) {
  const length = buffer.length;
  const numberOfChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const bytesPerSample = 2;
  const blockAlign = numberOfChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = length * blockAlign;
  const bufferSize = 44 + dataSize;
  const arrayBuffer = new ArrayBuffer(bufferSize);
  const view = new DataView(arrayBuffer);
  
  // WAV header
  const writeString = (offset, string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };
  
  writeString(0, 'RIFF');
  view.setUint32(4, bufferSize - 8, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // audio format (PCM)
  view.setUint16(22, numberOfChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // bits per sample
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);
  
  // Convert float samples to 16-bit PCM
  let offset = 44;
  for (let i = 0; i < length; i++) {
    for (let channel = 0; channel < numberOfChannels; channel++) {
      const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
      offset += 2;
    }
  }
  
  return arrayBuffer;
}

function setupPlayback(blob) {
  // Clean up previous playback
  if (state.playback.audioUrl) {
    URL.revokeObjectURL(state.playback.audioUrl);
  }
  if (state.playback.audio) {
    state.playback.audio.pause();
    state.playback.audio = null;
  }
  
  // Create new audio URL and element
  const audioUrl = URL.createObjectURL(blob);
  const audio = new Audio(audioUrl);
  
  audio.addEventListener('loadedmetadata', () => {
    state.playback.duration = Math.floor(audio.duration);
    updatePlaybackButton();
  });

  audio.addEventListener('timeupdate', () => {
    state.playback.currentTime = Math.floor(audio.currentTime);
    updatePlaybackButton();
  });

  audio.addEventListener('ended', () => {
    state.playback.isPlaying = false;
    state.playback.currentTime = 0;
    updatePlaybackButton();
  });
  
  audio.addEventListener('pause', () => {
    state.playback.isPlaying = false;
    updatePlaybackButton();
  });
  
  state.playback.audio = audio;
  state.playback.audioUrl = audioUrl;
  voicePlaybackBtn.hidden = false;
  updatePlaybackButton();
}

function updatePlaybackButton() {
  if (!playbackIcon) return;
  
  const timeInfo = state.playback.audio ? ` (${formatTime(state.playback.currentTime)} / ${formatTime(state.playback.duration)})` : '';
  
  if (state.playback.isPlaying) {
    playbackIcon.innerHTML = '<rect width="4" height="16" x="6" y="4"/><rect width="4" height="16" x="14" y="4"/>';
  } else {
    playbackIcon.innerHTML = '<polygon points="6 3 20 12 6 21 6 3"/>';
  }
  
  // Update button title or we could append text to the button
  voicePlaybackBtn.title = `Playback${timeInfo}`;
  
  // Let's also update the file name hint to show the time if playing
  if (state.playback.isPlaying || state.playback.currentTime > 0) {
    const fileName = voiceFileName.textContent.split(' [')[0];
    voiceFileName.textContent = `${fileName} [${formatTime(state.playback.currentTime)} / ${formatTime(state.playback.duration)}]`;
  }
}

function togglePlayback() {
  if (!state.playback.audio) return;
  
  if (state.playback.isPlaying) {
    state.playback.audio.pause();
    state.playback.isPlaying = false;
  } else {
    state.playback.audio.play();
    state.playback.isPlaying = true;
  }
  updatePlaybackButton();
}

function saveSettings() {
  const payload = {
    voiceMode: state.voiceMode,
    minimaxConfig: state.minimaxConfig,
    minimaxVoices: state.minimaxVoices,
    elevenlabsConfig: state.elevenlabsConfig,
    elevenlabsVoices: state.elevenlabsVoices,
    activeVoice: state.activeVoice,
    activeBookId: state.activeBookId,
    ui: state.ui,
  };
  localStorage.setItem("rebook-settings", JSON.stringify(payload));
}

function loadSettings() {
  const raw = localStorage.getItem("rebook-settings");
  if (!raw) return;
  try {
    const saved = JSON.parse(raw);
    if (saved.voiceMode) state.voiceMode = saved.voiceMode;
    if (saved.minimaxConfig) state.minimaxConfig = saved.minimaxConfig;
    if (Array.isArray(saved.minimaxVoices)) state.minimaxVoices = saved.minimaxVoices;
    if (saved.elevenlabsConfig) state.elevenlabsConfig = saved.elevenlabsConfig;
    if (Array.isArray(saved.elevenlabsVoices)) state.elevenlabsVoices = saved.elevenlabsVoices;
    if (saved.activeVoice) state.activeVoice = saved.activeVoice;
    if (saved.activeBookId) state.activeBookId = saved.activeBookId;
    if (saved.ui) state.ui = saved.ui;
  } catch (error) {
    console.warn("Failed to load settings", error);
  }
}

function applySettingsToUI() {
  if (state.ui.leftCollapsed) leftPanel.classList.add('collapsed');
  if (state.ui.rightCollapsed) rightPanel.classList.add('collapsed');
  
  if (state.activeVoice) {
    updateActiveVoiceUI();
  }
  
  voiceProvider.value = state.voiceMode;
  renderVoiceList();
  renderBookGrid();
}

function updateActiveVoiceUI() {
  if (!state.activeVoice) return;
  activeVoiceName.textContent = state.activeVoice.label;
  activeVoiceProvider.textContent = state.activeVoice.provider;
  // In a real app we'd have avatars, for now use initials or generic icon
  activeVoiceAvatar.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-volume2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>`;
}

function setActiveVoice(provider, voiceId, label) {
  state.activeVoice = { provider, voiceId, label: label || voiceId };
  state.voiceMode = provider;
  voiceCreate.setAttribute('hidden', '');
  // Reset button text when closing form
  const buttonText = voiceCreateToggle.querySelector('span');
  if (buttonText) {
    buttonText.textContent = "Create New Voice";
  }
  updateActiveVoiceUI();
  saveSettings();
  renderVoiceList();
  pauseReaderPlayback();
}

function renderBookGrid() {
  bookGrid.innerHTML = "";
  if (!state.library || state.library.length === 0) {
    bookGrid.innerHTML = '<div class="muted" style="text-align: center; padding: 20px; font-size: 0.8rem;">No books yet.</div>';
    return;
  }

  state.library.forEach((book) => {
    if (!book) return;
    const card = document.createElement("div");
    card.className = `book-card ${book.id === state.activeBookId ? 'active' : ''}`;
    
    const displayTitle = book.title || "Untitled";
    const initial = displayTitle[0] || "?";
    
    let coverHtml = `<div class="book-cover" style="background: var(--border-color); display: flex; align-items: center; justify-content: center; font-size: 2rem; font-weight: 700; color: var(--text-muted);">${initial}</div>`;
    if (book.coverBase64) {
      const mime = book.coverMime || "image/jpeg";
      coverHtml = `<img src="data:${mime};base64,${book.coverBase64}" class="book-cover" alt="${displayTitle}" />`;
    }

    card.innerHTML = `
      <div class="book-cover-wrapper">
        ${coverHtml}
        <button type="button" class="book-remove-btn" data-book-id="${book.id}" title="Remove book">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="remove-icon"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          <span class="remove-text">Remove</span>
        </button>
      </div>
      <div class="book-info-small">
        <div class="book-title-small">${displayTitle}</div>
        <div class="book-author-small">${book.author || "Unknown"}</div>
      </div>
    `;
    
    // Handle remove button FIRST (before other click handlers)
    const removeBtn = card.querySelector('.book-remove-btn');
    if (removeBtn) {
      removeBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        if (removeBtn.classList.contains('confirm-state')) {
          console.log("Removal confirmed for book:", book.id);
          removeBook(book.id, true); // True means confirmed
    } else {
          // Enter confirmation state
          removeBtn.classList.add('confirm-state');
          removeBtn.querySelector('.remove-text').textContent = "Confirm?";
          removeBtn.style.background = "#b91c1c"; // Darker red
          
          // Reset after 3 seconds if not clicked
          setTimeout(() => {
            if (removeBtn) {
              removeBtn.classList.remove('confirm-state');
              const textEl = removeBtn.querySelector('.remove-text');
              if (textEl) textEl.textContent = "Remove";
              removeBtn.style.background = ""; // Reset to CSS default
            }
          }, 3000);
        }
      });
    }
    
    // Handle book selection on the card (but not on remove button)
    card.addEventListener("click", (e) => {
      // Don't select if clicking on remove button or its children
      if (e.target.closest('.book-remove-btn')) {
    return;
  }
      setActiveBook(book.id);
    });
    
    bookGrid.appendChild(card);
  });
}

function removeBook(bookId, isConfirmed = false) {
  if (!isConfirmed) return;

  console.log("removeBook executing for bookId:", bookId);
  const beforeCount = state.library.length;
  state.library = state.library.filter(book => book && book.id !== bookId);
  const afterCount = state.library.length;
  
  console.log(`Library before: ${beforeCount}, after: ${afterCount}`);
  
  // If the removed book was active, clear the selection
  if (state.activeBookId === bookId) {
    state.activeBookId = null;
    state.book = null;
    resetReaderState();
  }
  
  // Save to localStorage
  try {
    localStorage.setItem("rebook-library", JSON.stringify(state.library));
    saveSettings();
    console.log("Library saved to localStorage");
  } catch (error) {
    console.error("Error saving library:", error);
  }
  
  // Re-render
  renderBookGrid();
  renderReader();
  setStatus("Book removed", "success");
}

function renderVoiceList() {
  voiceList.innerHTML = "";
  const combined = [
    ...(state.minimaxVoices || []).map((v) => ({ ...v, provider: "minimax" })),
    ...(state.elevenlabsVoices || []).map((v) => ({ ...v, provider: "elevenlabs" })),
  ];

  if (combined.length === 0) {
    voiceList.innerHTML = '<div class="muted" style="font-size: 0.8rem; padding: 10px;">No voices yet.</div>';
    return;
  }

  combined.forEach((voice) => {
    if (!voice) return;
    const isActive = state.activeVoice && state.activeVoice.voiceId === voice.voiceId && state.activeVoice.provider === voice.provider;
    const item = document.createElement("button");
    item.className = `voice-item ${isActive ? 'active' : ''}`;
    
    item.innerHTML = `
      <div class="voice-item-avatar">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-volume2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>
        ${voice.isCloned ? '<div class="cloned-badge"></div>' : ''}
      </div>
      <div class="voice-item-details">
        <div class="voice-item-name">${voice.label || voice.voiceId || "Unnamed Voice"}</div>
        <div class="voice-item-provider">${voice.provider === 'minimax' ? 'Minimax' : 'Eleven Labs'}</div>
      </div>
    `;
    
    item.addEventListener("click", () => setActiveVoice(voice.provider, voice.voiceId, voice.label));
    voiceList.appendChild(item);
  });
}

function formatReaderText(text) {
  const parts = text.split(/\n{2,}/).filter(Boolean);
  return parts.map(part => `<p>${part}</p>`).join("");
}

function renderReader() {
  if (!state.book) {
    readerText.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon"><svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-book-open"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg></div>
        <p>Select a book to start reading</p>
      </div>`;
    readerTitle.textContent = "Select a book";
    readerMeta.textContent = "0% read";
    readerPrev.disabled = true;
    readerNext.disabled = true;
    readerPlay.disabled = true;
    return;
  }

  const page = state.reader.pages[state.reader.pageIndex] || "";
  const progress = Math.round(((state.reader.pageIndex + 1) / state.reader.pages.length) * 100) || 0;
  
  readerTitle.textContent = state.book.title;
  readerMeta.textContent = `${progress}% read`;
  
  // Just show title and content
  readerText.innerHTML = `
    <h2>${state.book.title}</h2>
    ${formatReaderText(page)}
  `;
  
  readerPrev.disabled = state.reader.pageIndex === 0;
  readerNext.disabled = state.reader.pageIndex >= state.reader.pages.length - 1;
  readerPlay.disabled = !state.activeVoice;
  
  readerPlay.innerHTML = state.reader.isPlaying 
    ? `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-pause"><rect width="4" height="16" x="6" y="4"/><rect width="4" height="16" x="14" y="4"/></svg>`
    : `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-play"><polygon points="6 3 20 12 6 21 6 3"/></svg>`;

  updatePlaybackProgress();
}

function updatePlaybackProgress() {
  if (!state.reader.sentences.length) {
    playbackProgressFill.style.width = '0%';
    if (playbackTimeLabel) playbackTimeLabel.textContent = '0:00 / 0:00';
    return;
  }
  const progress = (state.reader.sentenceIndex / state.reader.sentences.length) * 100;
  playbackProgressFill.style.width = `${progress}%`;
  
  if (playbackTimeLabel) {
    playbackTimeLabel.textContent = `Sentence ${state.reader.sentenceIndex + 1} / ${state.reader.sentences.length}`;
  }
}

function parseAuthorName(name) {
  if (!name) return "";
  // Handle formats like "Dalio, Ray;" or "Kelly, Kevin"
  const cleanName = name.replace(/;/g, "").trim();
  if (cleanName.includes(",")) {
    const parts = cleanName.split(",").map(p => p.trim());
    if (parts.length >= 2) {
      return `${parts[1]} ${parts[0]}`;
    }
  }
  return cleanName;
}

function setActiveBook(bookId) {
  const book = state.library.find((item) => item.id === bookId) || null;
  state.activeBookId = book ? book.id : null;
  state.book = book;
  saveSettings();
  renderBookGrid();
  
  if (book) {
    buildReaderData(book);
    // Autofill author name for voice cloning
    if (book.author) {
      voiceNameInput.value = parseAuthorName(book.author);
    }
  } else {
    resetReaderState();
  }
  renderReader();
}

function resetReaderState() {
  state.reader = {
    pages: [],
    pageIndex: 0,
    sentences: [],
    sentenceIndex: 0,
    sentencePageMap: [],
    isPlaying: false,
    isAdvancing: false,
    prefetchQueue: [],
    isPrefetching: false,
  };
}

function buildReaderData(book) {
  const paragraphs = [];
  book.chapters.forEach((chapter) => {
    chapter.text.split(/\n+/).map(l => l.trim()).filter(Boolean).forEach(l => paragraphs.push(l));
  });

  const combined = paragraphs.join(" ");
  const sentences = splitIntoSentences(combined);
  const pages = [];
  const sentencePageMap = [];
  const wordLimit = 250;
  let current = [];
  let currentCount = 0;
  const pageWordCounts = [];

  paragraphs.forEach((paragraph) => {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (currentCount + words.length > wordLimit && currentCount > 0) {
      pages.push(current.join("\n\n"));
      pageWordCounts.push(currentCount);
      current = [];
      currentCount = 0;
    }
    current.push(paragraph);
    currentCount += words.length;
  });

  if (current.length > 0) {
    pages.push(current.join("\n\n"));
    pageWordCounts.push(currentCount);
  }

  let pIdx = 0;
  let pWordTotal = pageWordCounts[0] || 0;
  let sWordTotal = 0;

  sentences.forEach((s, i) => {
    const words = s.split(/\s+/).filter(Boolean);
    sWordTotal += words.length;
    while (sWordTotal > pWordTotal && pIdx < pageWordCounts.length - 1) {
      pIdx += 1;
      pWordTotal += pageWordCounts[pIdx];
    }
    sentencePageMap[i] = pIdx;
  });

  state.reader = {
    ...state.reader,
    pages,
    pageIndex: 0,
    sentences,
    sentenceIndex: 0,
    sentencePageMap,
    isPlaying: false,
  };
}

function splitIntoSentences(text) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  const matches = normalized.match(/[^.!?]+[.!?]+|[^.!?]+$/g);
  return matches ? matches.map((item) => item.trim()).filter(Boolean) : [];
}

async function handleEpubImport(file) {
  setStatus("Importing EPUB", "busy");
  resetPlayback();
  try {
    const base64 = await readFileAsBase64(file);
    const book = await invoke("parse_epub", { base64 });
    const entry = {
      id: `book-${Date.now()}`,
      title: book.title,
      author: book.author,
      coverBase64: book.coverBase64 || null,
      coverMime: book.coverMime || null,
      chapters: book.chapters,
      importedAt: new Date().toISOString(),
    };
    state.library.unshift(entry);
    await saveLibrary();
    setActiveBook(entry.id);
    setStatus("Book ready", "success");
  } catch (error) {
    console.error("EPUB Import Error:", error);
    setStatus(`Import failed: ${error}`, "error");
  } finally {
    epubInput.value = "";
  }
}

async function playNextChunk() {
  if (!state.reader.isPlaying || state.reader.isAdvancing) return;
  if (state.reader.sentenceIndex >= state.reader.sentences.length) {
    state.reader.isPlaying = false;
    setStatus("Playback complete", "success");
    renderReader();
    return;
  }

  state.reader.isAdvancing = true;
  const chunk = state.reader.sentences.slice(state.reader.sentenceIndex, state.reader.sentenceIndex + 2).join(" ");
  const count = 2;

  try {
    const audioClip = await invoke("tts_generate", {
      request: {
        chapterId: `chunk-${state.reader.sentenceIndex}`,
        text: chunk,
        voiceMode: state.voiceMode,
        minimax: state.voiceMode === 'minimax' ? { voiceId: state.activeVoice.voiceId, model: "speech-2.6-hd", outputFormat: "mp3" } : null,
        elevenlabs: state.voiceMode === 'elevenlabs' ? { voiceId: state.activeVoice.voiceId, model: "eleven_multilingual_v2" } : null,
        external: null
      }
    });
    
    const audio = new Audio(`data:${audioClip.mime};base64,${audioClip.audioBase64}`);
    state.activeAudio = audio;
    audio.addEventListener("ended", () => {
      state.reader.sentenceIndex += count;
      const nextPageIndex = state.reader.sentencePageMap[state.reader.sentenceIndex] ?? state.reader.pageIndex;
      if (nextPageIndex !== state.reader.pageIndex) {
        state.reader.pageIndex = nextPageIndex;
        renderReader();
      } else {
        updatePlaybackProgress();
      }
      state.reader.isAdvancing = false;
      playNextChunk();
    });
    audio.play();
    setStatus("Playing", "playing");
  } catch (error) {
    console.error(error);
    setStatus("Playback failed", "error");
    pauseReaderPlayback();
  }
}

function pauseReaderPlayback() {
  state.reader.isPlaying = false;
  state.reader.isAdvancing = false;
  resetPlayback();
  setStatus("Paused", "idle");
  renderReader();
}

function toggleReaderPlayback() {
  if (!state.book || !state.activeVoice) return;
  if (state.reader.isPlaying) {
    pauseReaderPlayback();
  } else {
  state.reader.isPlaying = true;
  renderReader();
  playNextChunk();
  }
}

async function handleVoiceClone() {
  const file = voiceFileInput.files[0];
  const name = voiceNameInput.value.trim();
  if (!file || !name) {
    alert("File and name required");
    return;
  }
  
  const provider = voiceProvider.value;
  
  // Show spinner
  const originalBtnContent = voiceCloneButton.innerHTML;
  voiceCloneButton.disabled = true;
  voiceCloneButton.innerHTML = `<div class="spinner"></div><span>Creating...</span>`;

  try {
    const audioBase64 = await readFileAsBase64(file);
    let voiceId;
    if (provider === "minimax") {
      const upload = await invoke("minimax_upload_clone_audio", { request: { filename: file.name, audioBase64 } });
      voiceId = `rebook_${name.toLowerCase().replace(/\s+/g, '_')}_${Date.now().toString(36)}`;
      await invoke("minimax_create_clone", { request: { fileId: upload.fileId, voiceId } });
      state.minimaxVoices.push({ voiceId, label: name, isCloned: true });
    } else {
      const clone = await invoke("elevenlabs_create_clone", { request: { name, filename: file.name, audioBase64 } });
      voiceId = clone.voiceId;
      state.elevenlabsVoices.push({ voiceId, label: name, isCloned: true });
    }
    
    setActiveVoice(provider, voiceId, name);
    voiceCreate.setAttribute('hidden', '');
    // Reset button text when closing form
    const buttonText = voiceCreateToggle.querySelector('span');
    if (buttonText) {
      buttonText.textContent = "Create New Voice";
    }
    voiceNameInput.value = "";
    voiceFileInput.value = "";
    voiceFileName.textContent = "Upload or record ~30 seconds of clean audio";
    // Clean up playback
    if (state.playback.audio) {
      state.playback.audio.pause();
      state.playback.audio = null;
    }
    if (state.playback.audioUrl) {
      URL.revokeObjectURL(state.playback.audioUrl);
      state.playback.audioUrl = null;
    }
    voicePlaybackBtn.hidden = true;
  } catch (error) {
    console.error(error);
    alert("Voice creation failed: " + error);
  } finally {
    voiceCloneButton.disabled = false;
    voiceCloneButton.innerHTML = originalBtnContent;
  }
}

async function saveLibrary() {
  try {
    await invoke("save_library", { library: state.library });
  } catch (error) {
    console.error("Failed to save library:", error);
  }
}

async function loadLibrary() {
  try {
    const saved = await invoke("load_library");
    if (Array.isArray(saved)) {
      state.library = saved;
      renderBookGrid();
      if (state.activeBookId) {
        setActiveBook(state.activeBookId);
      }
    }
  } catch (error) {
    console.error("Failed to load library:", error);
  }
}

function backfillVoices() {
  const minimaxId = "ray-dalio";
  if (!state.minimaxVoices.some((voice) => voice.voiceId === minimaxId)) {
    state.minimaxVoices.push({
      voiceId: minimaxId,
      label: "Ray Dalio",
      createdAt: new Date().toISOString(),
      isCloned: true,
    });
  }
}

// Initial Setup
loadSettings();
loadLibrary().then(() => {
  backfillVoices();
  applySettingsToUI();
  setActiveBook(state.activeBookId);
});

// Event Listeners
toggleLeftBtn.addEventListener('click', () => {
  state.ui.leftCollapsed = !state.ui.leftCollapsed;
  leftPanel.classList.toggle('collapsed');
  saveSettings();
});

toggleRightBtn.addEventListener('click', () => {
  state.ui.rightCollapsed = !state.ui.rightCollapsed;
  rightPanel.classList.toggle('collapsed');
  saveSettings();
});

importTrigger.addEventListener("click", () => epubInput.click());
epubInput.addEventListener("change", (e) => {
  if (e.target.files[0]) handleEpubImport(e.target.files[0]);
});

voiceCreateToggle.addEventListener("click", () => {
  const isCurrentlyHidden = voiceCreate.hasAttribute('hidden');
  
  if (isCurrentlyHidden) {
    voiceCreate.removeAttribute('hidden');
  } else {
    voiceCreate.setAttribute('hidden', '');
  }
  
  // Update button text to reflect state
  const buttonText = voiceCreateToggle.querySelector('span');
  if (buttonText) {
    buttonText.textContent = isCurrentlyHidden ? "Close" : "Create New Voice";
  }
});

voiceFileInput.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (file) {
    voiceFileName.textContent = file.name;
    // Setup playback for uploaded file
    setupPlayback(file);
  } else {
    voiceFileName.textContent = "Upload or record ~30 seconds of clean audio";
    // Clean up playback
    if (state.playback.audio) {
      state.playback.audio.pause();
      state.playback.audio = null;
    }
    if (state.playback.audioUrl) {
      URL.revokeObjectURL(state.playback.audioUrl);
      state.playback.audioUrl = null;
    }
    voicePlaybackBtn.hidden = true;
  }
});

voiceRecordBtn.addEventListener("click", () => {
  if (state.recording.isRecording) {
    stopRecording();
  } else {
    startRecording();
  }
});

voicePlaybackBtn.addEventListener("click", togglePlayback);

voiceCloneButton.addEventListener("click", handleVoiceClone);

readerPrev.addEventListener("click", () => {
  if (state.reader.pageIndex > 0) {
    state.reader.pageIndex--;
    const sIdx = state.reader.sentencePageMap.findIndex(v => v === state.reader.pageIndex);
    if (sIdx >= 0) state.reader.sentenceIndex = sIdx;
    renderReader();
  }
});

readerNext.addEventListener("click", () => {
  if (state.reader.pageIndex < state.reader.pages.length - 1) {
    state.reader.pageIndex++;
    const sIdx = state.reader.sentencePageMap.findIndex(v => v === state.reader.pageIndex);
    if (sIdx >= 0) state.reader.sentenceIndex = sIdx;
    renderReader();
  }
});

readerPlay.addEventListener("click", toggleReaderPlayback);
