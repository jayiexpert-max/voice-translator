export function isTextToSpeechSupported() {
  return "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
}

export function loadVoices() {
  if (!isTextToSpeechSupported()) {
    return Promise.resolve([]);
  }

  const existingVoices = window.speechSynthesis.getVoices();

  if (existingVoices.length > 0) {
    return Promise.resolve(existingVoices);
  }

  return new Promise((resolve) => {
    const timeout = window.setTimeout(() => {
      resolve(window.speechSynthesis.getVoices());
    }, 2500);

    const handleVoicesChanged = () => {
      window.clearTimeout(timeout);
      window.speechSynthesis.removeEventListener("voiceschanged", handleVoicesChanged);
      resolve(window.speechSynthesis.getVoices());
    };

    window.speechSynthesis.addEventListener("voiceschanged", handleVoicesChanged);
  });
}

export function getPreferredVoice(voices, languageCode, voiceURI = "") {
  if (voiceURI) {
    const selectedVoice = voices.find((voice) => voice.voiceURI === voiceURI);

    if (selectedVoice) {
      return selectedVoice;
    }
  }

  const normalizedLanguage = languageCode.toLowerCase();
  const languagePrefix = normalizedLanguage.split("-")[0];

  return (
    voices.find((voice) => voice.lang.toLowerCase() === normalizedLanguage) ||
    voices.find((voice) => voice.lang.toLowerCase().startsWith(languagePrefix)) ||
    null
  );
}

export function speakText({
  text,
  languageCode,
  voices,
  voiceURI,
  onStart,
  onEnd,
  onError,
}) {
  if (!isTextToSpeechSupported()) {
    throw new Error("Text-to-speech is not supported in this browser.");
  }

  const normalizedText = text.trim();

  if (!normalizedText) {
    throw new Error("There is no translated text to speak.");
  }

  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(normalizedText);
  utterance.lang = languageCode;
  utterance.rate = 0.95;
  utterance.pitch = 1;

  const voice = getPreferredVoice(voices, languageCode, voiceURI);

  if (voice) {
    utterance.voice = voice;
  }

  utterance.onstart = () => onStart?.(voice);
  utterance.onend = () => onEnd?.();
  utterance.onerror = (event) => {
    onError?.(new Error(`Speech playback failed (${event.error}).`));
  };

  window.speechSynthesis.speak(utterance);

  return utterance;
}

export function pauseSpeech() {
  if (isTextToSpeechSupported() && window.speechSynthesis.speaking) {
    window.speechSynthesis.pause();
  }
}

export function resumeSpeech() {
  if (isTextToSpeechSupported() && window.speechSynthesis.paused) {
    window.speechSynthesis.resume();
  }
}

export function stopSpeech() {
  if (isTextToSpeechSupported()) {
    window.speechSynthesis.cancel();
  }
}
