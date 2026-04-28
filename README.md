# Jani Web Voice Assistant

Open `index.html` in Chrome and allow microphone access when the browser asks.

Press the center mic once to arm wake mode. Say `Jani`, then say a command
such as `open YouTube`. You can also say both together: `Jani open YouTube`.
If Chrome blocks a new tab, Jani falls back to opening the requested site in
the current tab.

If voice input does not start:

- Check the microphone permission icon in Chrome's address bar.
- Use regular Google Chrome instead of an embedded/in-app browser if speech recognition is blocked.
- Select a different voice input language in the System panel.
- Watch the Input Level meter while speaking. If it stays flat, Chrome is not receiving microphone audio. If it moves but no words appear, Chrome's SpeechRecognition service is not decoding the speech.
- Use the typed command box to test commands while mic permission is blocked.

This project is frontend-only. It uses HTML, CSS, JavaScript, SpeechRecognition,
SpeechSynthesis, and browser tabs only.
