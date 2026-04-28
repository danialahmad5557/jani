(function () {
  let assistant;
  let processingTimer;
  let wakeRestartTimer;
  let actionWindow = null;
  let wakeMode = false;
  let awaitingCommand = false;

  function getSelectedLanguage() {
    return document.getElementById("languageSelect").value;
  }

  function isWakeRecoverable(error) {
    return !error || ["no-speech", "silence-timeout", "speech-not-decoded", "no-input"].includes(error);
  }

  function setIdle() {
    clearTimeout(wakeRestartTimer);
    JarvisUI.setMode("idle");
    JarvisUI.setStatus("Idle", "Standby");
    JarvisUI.setWakeStatus("Off");
    JarvisUI.setCoreStatus("Tap mic to arm wake mode", "Wake word: Jani");
    JarvisUI.updateWaveform(false);
    JarvisUI.setMicActive(false);
  }

  function setWakeUi() {
    if (awaitingCommand) {
      JarvisUI.setMode("awake");
      JarvisUI.setStatus("Awake", "Say command now");
      JarvisUI.setWakeStatus("Jani heard");
      JarvisUI.setCoreStatus("Jani is awake. Say the command.", "Awaiting command");
      JarvisUI.setTranscript("Jani awake. Say a command like open YouTube.");
      return;
    }

    JarvisUI.setMode("armed");
    JarvisUI.setStatus("Armed", "Say Jani");
    JarvisUI.setWakeStatus("Waiting");
    JarvisUI.setCoreStatus("Say Jani to activate", "Wake word: Jani");
    JarvisUI.setTranscript('Wake mode armed. Say "Jani" first.');
  }

  async function startWakeListening(delay = 0) {
    clearTimeout(wakeRestartTimer);
    if (!wakeMode || assistant.listening) return;

    wakeRestartTimer = setTimeout(async () => {
      if (!wakeMode || assistant.listening) return;
      setWakeUi();
      JarvisUI.setMicActive(true);
      const started = await assistant.start(getSelectedLanguage(), {
        timeoutMs: awaitingCommand ? 10000 : 18000,
      });
      if (!started && wakeMode) {
        wakeMode = false;
        awaitingCommand = false;
        setIdle();
      }
    }, delay);
  }

  function stopWakeMode() {
    wakeMode = false;
    awaitingCommand = false;
    clearTimeout(wakeRestartTimer);
    if (actionWindow && !actionWindow.closed) {
      try {
        if (actionWindow.location.href === "about:blank") actionWindow.close();
      } catch (error) {
        // Cross-origin action tabs are left alone once a command has used them.
      }
    }
    actionWindow = null;
    if (assistant?.listening) {
      assistant.stop();
    }
    assistant?.cancelSpeech();
    setIdle();
  }

  function prepareActionWindow() {
    // Voice callbacks are asynchronous, so Chrome may block new tabs later.
    // Opening a named blank tab from the mic click keeps a user-approved target ready.
    try {
      actionWindow = window.open("about:blank", "jani_action_tab");
      if (actionWindow) {
        actionWindow.document.title = "Jani action tab";
        actionWindow.document.body.innerHTML = "<p style=\"font-family:Arial;background:#020407;color:#42e8ff;padding:24px\">Jani is waiting for your command...</p>";
        actionWindow.opener = null;
        actionWindow.blur();
        window.focus();
      }
    } catch (error) {
      actionWindow = null;
    }
  }

  function tryOpenBrowserAction(result, options = {}) {
    if (!result.url) {
      JarvisUI.hideActionLink();
      return;
    }

    if (actionWindow && !actionWindow.closed) {
      try {
        actionWindow.location.href = result.url;
        actionWindow = null;
        JarvisUI.hideActionLink();
        return;
      } catch (error) {
        actionWindow = null;
      }
    }

    const opened = window.open(result.url, "_blank");
    if (opened) {
      opened.opener = null;
      JarvisUI.hideActionLink();
      return;
    }

    JarvisUI.showActionLink(result.url, result.linkLabel || "Open requested tab");
    if (options.sameTabFallback) {
      JarvisUI.addMessage("system", "Chrome blocked the new tab, so I am opening it in this tab instead.");
      setTimeout(() => {
        window.location.href = result.url;
      }, 700);
      return;
    }

    JarvisUI.addMessage("system", "Chrome blocked the automatic new tab. Use the launch button in the System panel.");
  }

  function runCommand(text, options = {}) {
    const commandText = text.trim();
    if (!commandText) return;

    awaitingCommand = false;
    JarvisUI.addMessage("user", commandText);
    JarvisUI.setTranscript(commandText);
    JarvisUI.setMode("processing");
    JarvisUI.setStatus("Processing", "Command analysis");
    JarvisUI.setWakeStatus(wakeMode ? "Command" : "Off");
    JarvisUI.setCoreStatus("Processing command", "Jani active");
    JarvisUI.hideActionLink();

    function finishCommand() {
      const result = JarvisCommands.processCommand(commandText);
      if (options.allowBrowserAction) {
        tryOpenBrowserAction(result, {
          sameTabFallback: Boolean(options.sameTabFallback),
        });
      } else if (result.url) {
        JarvisUI.showActionLink(result.url, result.linkLabel || "Open requested tab");
      }
      JarvisUI.addMessage("system", result.response);
      JarvisUI.setTranscript(result.response);
      JarvisUI.playSound("response");
      assistant.speak(result.response);
    }

    clearTimeout(processingTimer);
    if (options.fast) {
      finishCommand();
    } else {
      processingTimer = setTimeout(finishCommand, 320);
    }
  }

  function handleWakeTranscript(text, error) {
    JarvisUI.playSound("stop");
    JarvisUI.updateWaveform(false);

    if (!wakeMode) {
      setIdle();
      return;
    }

    if (!text) {
      if (isWakeRecoverable(error)) {
        JarvisUI.setMicStatus(error ? "Still armed" : "Listening");
        startWakeListening(450);
        return;
      }

      wakeMode = false;
      awaitingCommand = false;
      JarvisUI.showSpeechProblem(error);
      setIdle();
      return;
    }

    const wakeIntent = JarvisCommands.getWakeIntent(text);

    if (awaitingCommand) {
      const command = wakeIntent.hasWakeWord && wakeIntent.commandText ? wakeIntent.commandText : text;
        runCommand(command, { allowBrowserAction: true, sameTabFallback: true });
      return;
    }

    if (wakeIntent.hasWakeWord) {
      JarvisUI.playSound("response");
      if (wakeIntent.commandText) {
        runCommand(wakeIntent.commandText, { allowBrowserAction: true, sameTabFallback: true });
        return;
      }

      awaitingCommand = true;
      JarvisUI.addMessage("system", "Jani heard. Waiting for your command.");
      setWakeUi();
      startWakeListening(500);
      return;
    }

    JarvisUI.setTranscript(`Heard "${text}". Say "Jani" first to activate.`);
    startWakeListening(500);
  }

  function handleFinalTranscript(text, error) {
    if (wakeMode) {
      handleWakeTranscript(text, error);
      return;
    }

    JarvisUI.playSound("stop");
    JarvisUI.updateWaveform(false);
    JarvisUI.setMicActive(false);

    if (error && error !== "aborted" && !text) {
      setIdle();
      if (error === "no-speech") {
        JarvisUI.showSpeechProblem(assistant.voiceDetected || assistant.peakLevel > 0.08 ? "speech-not-decoded" : "no-input");
      }
      return;
    }

    if (!text) {
      setIdle();
      JarvisUI.showSpeechProblem("no-speech");
      return;
    }

    runCommand(text, { allowBrowserAction: true, sameTabFallback: true });
  }

  function boot() {
    JarvisUI.init();

    assistant = new JarvisSpeech({
      onStart() {
        JarvisUI.playSound("start");
        if (wakeMode) {
          setWakeUi();
        } else {
          JarvisUI.setMode("listening");
          JarvisUI.setStatus("Listening", "Voice stream active");
          JarvisUI.setWakeStatus("Direct");
          JarvisUI.setCoreStatus("Listening for command", "Direct command");
          JarvisUI.setTranscript("Listening...");
        }
        JarvisUI.setMicStatus("Listening");
        JarvisUI.setMicActive(true);
        JarvisUI.updateWaveform(true);
      },
      onTranscript(text, isInterim) {
        if (wakeMode && !awaitingCommand && JarvisCommands.getWakeIntent(text).hasWakeWord) {
          JarvisUI.setMode("awake");
          JarvisUI.setWakeStatus("Jani heard");
          JarvisUI.setCoreStatus("Wake word detected", "Jani active");
        }
        JarvisUI.setTranscript(isInterim ? `${text} ...` : text);
      },
      onAudioLevel(level, details) {
        if (assistant?.listening) {
          JarvisUI.updateWaveform(true, level);
          JarvisUI.setMicStatus(details.voiceDetected ? "Audio detected" : "Listening");
        } else {
          JarvisUI.updateWaveform(false);
        }
      },
      onEnd: handleFinalTranscript,
      onError(error) {
        if (wakeMode && isWakeRecoverable(error)) {
          JarvisUI.setMicStatus("Still armed");
          return;
        }
        if (error === "no-speech") {
          JarvisUI.setMicStatus("No words");
          return;
        }
        JarvisUI.showSpeechProblem(error);
        wakeMode = false;
        awaitingCommand = false;
        setIdle();
      },
      onSpeakStart() {
        JarvisUI.setMode("speaking");
        JarvisUI.setStatus("Speaking", "Voice synthesis");
        JarvisUI.setCoreStatus("Speaking response", "Jani active");
      },
      onSpeakEnd() {
        if (wakeMode) {
          startWakeListening(700);
        } else {
          setIdle();
        }
      },
      onPermission(state) {
        const labels = {
          granted: "Allowed",
          prompt: "Needs allow",
          denied: "Denied",
          unknown: "Unknown",
        };
        JarvisUI.setMicStatus(labels[state] || state);
      },
    });

    if (!assistant.supported) {
      JarvisUI.showUnsupported();
    } else {
      JarvisUI.setMicStatus("Ready");
      document.getElementById("languageSelect").addEventListener("change", (event) => {
        assistant.setLanguage(event.target.value);
        JarvisUI.setTranscript(`Voice input language set to ${event.target.options[event.target.selectedIndex].text}.`);
      });

      document.getElementById("micButton").addEventListener("click", () => {
        if (wakeMode || assistant.listening) {
          stopWakeMode();
          return;
        }

        wakeMode = true;
        awaitingCommand = false;
        prepareActionWindow();
        JarvisUI.setStatus("Preparing", "Mic permission check");
        JarvisUI.setWakeStatus("Arming");
        JarvisUI.setCoreStatus("Checking microphone permission", "Wake word: Jani");
        JarvisUI.setTranscript("Checking microphone permission...");
        startWakeListening();
      });
    }

    document.getElementById("textCommandForm").addEventListener("submit", (event) => {
      event.preventDefault();
      const input = document.getElementById("textCommandInput");
      const command = input.value.trim();
      if (command) {
        input.value = "";
        runCommand(command, { allowBrowserAction: true, fast: true, sameTabFallback: true });
      }
    });

    document.querySelectorAll("[data-command]").forEach((button) => {
      button.addEventListener("click", () => {
        runCommand(button.dataset.command, { allowBrowserAction: true, fast: true, sameTabFallback: true });
      });
    });

    document.getElementById("stopSpeechButton").addEventListener("click", () => {
      stopWakeMode();
    });
  }

  window.addEventListener("DOMContentLoaded", boot);
})();
