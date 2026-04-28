(function () {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  function mapMediaError(error) {
    if (!error) return "mic-unavailable";
    if (error.name === "NotAllowedError" || error.name === "SecurityError") return "not-allowed";
    if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") return "audio-capture";
    if (error.name === "NotReadableError" || error.name === "TrackStartError") return "audio-capture";
    return "mic-unavailable";
  }

  function pickVoice(preferredLang) {
    const voices = window.speechSynthesis.getVoices();
    return (
      voices.find((voice) => voice.lang && voice.lang.toLowerCase().startsWith(preferredLang.toLowerCase())) ||
      voices.find((voice) => voice.lang && voice.lang.toLowerCase().startsWith("ur")) ||
      voices.find((voice) => voice.lang && voice.lang.toLowerCase().startsWith("en")) ||
      null
    );
  }

  class JarvisSpeech {
    constructor(callbacks) {
      this.callbacks = callbacks;
      this.recognition = null;
      this.listening = false;
      this.supported = Boolean(SpeechRecognition);
      this.finalTranscript = "";
      this.bestTranscript = "";
      this.lastError = "";
      this.userStopped = false;
      this.audioStream = null;
      this.audioContext = null;
      this.analyser = null;
      this.audioFrame = 0;
      this.listenTimer = 0;
      this.voiceDetected = false;
      this.peakLevel = 0;

      if (this.supported) {
        this.recognition = new SpeechRecognition();
        this.recognition.lang = "en-US";
        this.recognition.interimResults = true;
        this.recognition.continuous = true;
        this.recognition.maxAlternatives = 3;
        this.bindRecognitionEvents();
      }

      window.speechSynthesis.onvoiceschanged = () => pickVoice("ur-PK");
    }

    bindRecognitionEvents() {
      this.recognition.onstart = () => {
        this.listening = true;
        this.finalTranscript = "";
        this.bestTranscript = "";
        this.lastError = "";
        this.callbacks.onStart?.();
      };

      this.recognition.onresult = (event) => {
        let interim = "";
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            this.finalTranscript += transcript;
          } else {
            interim += transcript;
          }
        }
        this.bestTranscript = (this.finalTranscript || interim || this.bestTranscript).trim();
        this.callbacks.onTranscript?.(this.bestTranscript, Boolean(interim));
        if (this.finalTranscript.trim()) {
          clearTimeout(this.listenTimer);
          setTimeout(() => {
            if (this.listening) this.recognition.stop();
          }, 250);
        }
      };

      this.recognition.onerror = (event) => {
        this.lastError = event.error || "speech-error";
        this.callbacks.onError?.(this.lastError);
      };

      this.recognition.onend = () => {
        const finalText = (this.finalTranscript || this.bestTranscript).trim();
        this.listening = false;
        clearTimeout(this.listenTimer);
        this.stopMicMonitor();
        this.callbacks.onEnd?.(finalText, this.userStopped ? "aborted" : this.lastError);
        this.userStopped = false;
      };
    }

    startMicMonitor(stream) {
      this.stopMicMonitor();
      this.audioStream = stream;
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;

      this.audioContext = new AudioContext();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 1024;
      const source = this.audioContext.createMediaStreamSource(stream);
      source.connect(this.analyser);

      const samples = new Uint8Array(this.analyser.fftSize);
      const tick = () => {
        if (!this.analyser) return;
        this.analyser.getByteTimeDomainData(samples);
        let sum = 0;
        for (let i = 0; i < samples.length; i += 1) {
          const value = (samples[i] - 128) / 128;
          sum += value * value;
        }
        const rms = Math.sqrt(sum / samples.length);
        const level = Math.min(1, rms * 7.5);
        this.peakLevel = Math.max(this.peakLevel, level);
        if (level > 0.08) this.voiceDetected = true;
        this.callbacks.onAudioLevel?.(level, {
          peakLevel: this.peakLevel,
          voiceDetected: this.voiceDetected,
        });
        this.audioFrame = requestAnimationFrame(tick);
      };
      tick();
    }

    stopMicMonitor() {
      if (this.audioFrame) cancelAnimationFrame(this.audioFrame);
      this.audioFrame = 0;
      if (this.audioStream) {
        this.audioStream.getTracks().forEach((track) => track.stop());
      }
      this.audioStream = null;
      this.analyser = null;
      if (this.audioContext) {
        this.audioContext.close().catch(() => {});
      }
      this.audioContext = null;
      this.callbacks.onAudioLevel?.(0, {
        peakLevel: this.peakLevel,
        voiceDetected: this.voiceDetected,
      });
    }

    async start(language, options = {}) {
      if (!this.supported || this.listening) return false;
      window.speechSynthesis.cancel();
      this.lastError = "";
      this.userStopped = false;
      this.voiceDetected = false;
      this.peakLevel = 0;
      const timeoutMs = options.timeoutMs || 12000;
      if (language) this.setLanguage(language);

      if (navigator.permissions?.query) {
        try {
          const permission = await navigator.permissions.query({ name: "microphone" });
          this.callbacks.onPermission?.(permission.state);
          if (permission.state === "denied") {
            this.callbacks.onError?.("denied");
            return false;
          }
        } catch (error) {
          this.callbacks.onPermission?.("unknown");
        }
      }

      if (navigator.mediaDevices?.getUserMedia) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
          });
          this.startMicMonitor(stream);
          this.callbacks.onPermission?.("granted");
        } catch (error) {
          this.callbacks.onError?.(mapMediaError(error));
          return false;
        }
      } else if (location.protocol !== "https:" && location.hostname !== "localhost" && location.protocol !== "file:") {
        this.callbacks.onError?.("mic-unavailable");
        return false;
      }

      try {
        this.recognition.start();
        clearTimeout(this.listenTimer);
        this.listenTimer = setTimeout(() => {
          if (!this.listening || this.bestTranscript) return;
          this.lastError = this.voiceDetected || this.peakLevel > 0.08 ? "speech-not-decoded" : "silence-timeout";
          this.recognition.stop();
        }, timeoutMs);
        return true;
      } catch (error) {
        this.stopMicMonitor();
        this.callbacks.onError?.(error.name || "start-failed");
        return false;
      }
    }

    stop() {
      if (!this.supported || !this.listening) return;
      this.userStopped = true;
      clearTimeout(this.listenTimer);
      this.recognition.stop();
    }

    speak(text) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      const voice = pickVoice("ur-PK");
      if (voice) {
        utterance.voice = voice;
        utterance.lang = voice.lang;
      } else {
        utterance.lang = "en-US";
      }
      utterance.rate = 0.94;
      utterance.pitch = 0.88;
      utterance.volume = 0.95;
      utterance.onstart = () => this.callbacks.onSpeakStart?.();
      utterance.onend = () => this.callbacks.onSpeakEnd?.();
      utterance.onerror = () => this.callbacks.onSpeakEnd?.();
      window.speechSynthesis.speak(utterance);
    }

    cancelSpeech() {
      window.speechSynthesis.cancel();
      this.callbacks.onSpeakEnd?.();
    }

    setLanguage(language) {
      if (!this.supported || !language) return;
      this.recognition.lang = language;
    }
  }

  window.JarvisSpeech = JarvisSpeech;
})();
