(function () {
  const state = {
    waveTimer: null,
    sounds: {},
  };

  function qs(id) {
    return document.getElementById(id);
  }

  function setMode(mode) {
    document.body.classList.toggle("is-listening", mode === "listening");
    document.body.classList.toggle("is-processing", mode === "processing");
    document.body.classList.toggle("is-speaking", mode === "speaking");
    document.body.classList.toggle("is-armed", mode === "armed");
    document.body.classList.toggle("is-awake", mode === "awake");
  }

  function setStatus(status, signal) {
    qs("statusText").textContent = status;
    qs("signalText").textContent = signal || status;
  }

  function setWakeStatus(status) {
    qs("wakeStatusText").textContent = status;
  }

  function setCoreStatus(text, badge) {
    qs("coreStatus").textContent = text;
    if (badge) qs("wakeBadge").textContent = badge;
  }

  function setMicStatus(status) {
    qs("micStatusText").textContent = status;
  }

  function addMessage(role, text) {
    const log = qs("chatLog");
    const entry = document.createElement("article");
    entry.className = `message ${role}`;
    const label = role === "user" ? "You" : "Jani";
    entry.innerHTML = `<strong>${label}</strong><span></span>`;
    entry.querySelector("span").textContent = text;
    log.appendChild(entry);
    log.scrollTop = log.scrollHeight;
  }

  function setTranscript(text) {
    qs("transcriptText").textContent = text;
  }

  function setMicLevel(level) {
    const normalized = Math.max(0, Math.min(1, Number(level) || 0));
    qs("micLevelBar").style.width = `${Math.round(normalized * 100)}%`;
  }

  function showActionLink(url, label) {
    const link = qs("actionLink");
    link.href = url;
    link.textContent = label || "Open requested tab";
    link.hidden = false;
  }

  function hideActionLink() {
    const link = qs("actionLink");
    link.hidden = true;
    link.removeAttribute("href");
  }

  function setMicActive(active) {
    const button = qs("micButton");
    button.setAttribute("aria-label", active ? "Stop Jani wake mode" : "Start Jani wake mode");
  }

  function updateWaveform(active, level) {
    const bars = Array.from(qs("waveform").children);
    if (!active) {
      clearInterval(state.waveTimer);
      state.waveTimer = null;
      setMicLevel(0);
      bars.forEach((bar) => {
        bar.style.height = "18px";
        bar.style.opacity = "0.48";
      });
      return;
    }

    if (typeof level === "number") {
      clearInterval(state.waveTimer);
      state.waveTimer = null;
      bars.forEach((bar, index) => {
        const wave = Math.sin((Date.now() / 90) + index) * 0.5 + 0.5;
        const height = 16 + Math.round((level * 72) * (0.52 + wave * 0.7));
        bar.style.height = `${height}px`;
        bar.style.opacity = String(Math.max(0.38, Math.min(1, 0.42 + level)));
      });
      setMicLevel(level);
      return;
    }

    clearInterval(state.waveTimer);
    state.waveTimer = setInterval(() => {
      bars.forEach((bar, index) => {
        const height = 18 + Math.round(Math.random() * 58) + (index % 3) * 4;
        bar.style.height = `${height}px`;
        bar.style.opacity = String(0.56 + Math.random() * 0.44);
      });
    }, 115);
  }

  function playSound(name) {
    const sound = state.sounds[name];
    if (!sound) return;
    sound.currentTime = 0;
    sound.play().catch(() => {
      // Chrome may block audio before the first user gesture.
    });
  }

  function updateClock() {
    qs("clock").textContent = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function showUnsupported() {
    setStatus("Limited", "Speech API unavailable");
    setWakeStatus("Unavailable");
    setCoreStatus("SpeechRecognition is unavailable here", "Jani offline");
    setMicStatus("Unavailable");
    addMessage("system", "Chrome SpeechRecognition is not available here. You can still use typed commands.");
  }

  function showSpeechProblem(error) {
    const messages = {
      "not-allowed": "Microphone permission was blocked. Allow microphone access in Chrome, then press the mic again.",
      denied: "Microphone permission is denied for this page. Change the site permission in Chrome and reload.",
      "service-not-allowed": "Chrome blocked the speech service. Try regular Chrome if this embedded browser does not expose speech recognition.",
      "no-speech": "I did not hear speech. Check the selected input device, speak closer to the mic, and try again.",
      "no-input": "The mic opened, but no real audio level came in. Check your Windows/Chrome input device and microphone volume.",
      "speech-not-decoded": "I can see mic audio, but Chrome did not decode words. Try another language option, speak after the Listening status appears, or use regular Chrome.",
      "silence-timeout": "Listening timed out before words were detected. Press the mic and speak after the input level starts moving.",
      "audio-capture": "No microphone was found by Chrome. Check your input device and browser permissions.",
      "mic-unavailable": "This browser context does not expose microphone capture. Use regular Chrome or allow microphone permission.",
      network: "Chrome speech recognition needs its browser speech service. Check internet access and try again.",
      "aborted": "Listening was stopped.",
      "language-not-supported": "That recognition language is not available in this Chrome session.",
      "start-failed": "Speech recognition could not start. Reload the page and try again in Chrome.",
    };
    const message = messages[error] || `Speech recognition notice: ${error}.`;
    setTranscript(message);
    setMicStatus(error === "aborted" ? "Stopped" : "Blocked");
    addMessage("system", message);
  }

  function init() {
    state.sounds = {
      start: qs("startSound"),
      stop: qs("stopSound"),
      response: qs("responseSound"),
    };
    updateClock();
    setInterval(updateClock, 1000);
    setWakeStatus("Off");
    setCoreStatus("Tap mic to arm wake mode", "Wake word: Jani");
    addMessage("system", "Jani online. Tap the mic, say Jani, then speak a command.");
  }

  window.JarvisUI = {
    init,
    setMode,
    setStatus,
    setWakeStatus,
    setCoreStatus,
    setMicStatus,
    setMicLevel,
    addMessage,
    setTranscript,
    showActionLink,
    hideActionLink,
    setMicActive,
    updateWaveform,
    playSound,
    showUnsupported,
    showSpeechProblem,
  };
})();
