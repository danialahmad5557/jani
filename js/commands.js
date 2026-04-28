(function () {
  const cannedReplies = [
    "Systems are nominal. Jani is listening.",
    "Understood. I can help with browser commands and conversation.",
    "Acknowledged. Keeping everything inside Chrome.",
    "I am here. What would you like to calculate, search, or discuss?",
  ];

  const wakePattern = /\b(jani|jaani|janii|johnny|jarvis)\b/i;

  function normalize(text) {
    return text.trim().replace(/\s+/g, " ");
  }

  function makeGoogleSearch(query) {
    return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
  }

  function stripWakeWords(input) {
    return input
      .replace(/\b(hey\s+)?(jani|jaani|janii|johnny|jarvis|assistant)\b/gi, " ")
      .replace(/\b(hey|ok)\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function getWakeIntent(rawText) {
    const text = normalize(rawText);
    const match = text.match(wakePattern);
    if (!match) {
      return {
        hasWakeWord: false,
        commandText: "",
        heardText: text,
      };
    }

    const beforeWake = text.slice(0, match.index).replace(/\b(hey|ok)\b/gi, "").trim();
    const afterWake = text.slice(match.index + match[0].length).trim();
    const commandText = stripWakeWords(afterWake || beforeWake);
    return {
      hasWakeWord: true,
      commandText,
      heardText: text,
    };
  }

  function getYouTubeUrl() {
    return "https://www.youtube.com";
  }

  function getConversationalReply(input) {
    const lower = input.toLowerCase();

    if (/(salam|assalam|hello|hi|hey)/i.test(lower)) {
      return "Wa alaikum assalam. Jani online and at your service.";
    }

    if (/(time|waqt)/i.test(lower)) {
      return `The current time is ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.`;
    }

    if (/(who are you|your name|tum kaun)/i.test(lower)) {
      return "I am Jani, a Chrome-based voice assistant running fully in this browser.";
    }

    if (/(thank|shukriya)/i.test(lower)) {
      return "Always a pleasure.";
    }

    const index = Math.floor(Math.random() * cannedReplies.length);
    return cannedReplies[index];
  }

  function processCommand(rawText) {
    const text = stripWakeWords(normalize(rawText));
    const lower = text.toLowerCase();

    if (/(^|\b)(open|launch|start)\s+(the\s+)?you\s*tube\b|\byou\s*tube\s+(open|launch|start|kholo|chalao)\b|\byou\s*tube\s+(khol|chala)/i.test(lower)) {
      return {
        action: "open",
        url: getYouTubeUrl(),
        linkLabel: "Open YouTube",
        response: "Opening YouTube in a new tab.",
      };
    }

    const searchMatch =
      text.match(/(?:search\s+google\s+for|google\s+search\s+for|search\s+for)\s+(.+)/i) ||
      text.match(/(?:search|google)\s+(.+?)\s+(?:on|in)\s+google/i) ||
      text.match(/google\s+(?:par\s+)?(?:search\s+)?(?:karo|karna)?\s+(.+)/i) ||
      text.match(/^google\s+(.+)/i);

    if (searchMatch && searchMatch[1]) {
      const query = searchMatch[1].trim().replace(/\s+on\s+google$/i, "");
      return {
        action: "search",
        url: makeGoogleSearch(query),
        linkLabel: `Search Google for ${query}`,
        response: `Searching Google for ${query}.`,
      };
    }

    return {
      action: "chat",
      response: getConversationalReply(text),
    };
  }

  window.JarvisCommands = {
    getWakeIntent,
    processCommand,
  };
})();
