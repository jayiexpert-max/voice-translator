const SPEAK_AFTER_CANCEL_DELAY_MS = 120;

let activeUtterance = null;
let pendingSpeakTimer = null;

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

  clearActiveUtterance();
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(normalizedText);
  activeUtterance = utterance;
  utterance.lang = languageCode;
  utterance.rate = 0.95;
  utterance.pitch = 1;

  const browserVoices = window.speechSynthesis.getVoices();
  const availableVoices = browserVoices.length > 0 ? browserVoices : voices;
  const voice = getPreferredVoice(availableVoices, languageCode, voiceURI);

  if (voice) {
    utterance.voice = voice;
  }

  utterance.onstart = () => {
    if (activeUtterance === utterance) {
      onStart?.(voice);
    }
  };
  utterance.onend = () => {
    if (activeUtterance !== utterance) {
      return;
    }

    activeUtterance = null;
    onEnd?.();
  };
  utterance.onerror = (event) => {
    if (activeUtterance !== utterance) {
      return;
    }

    activeUtterance = null;
    onError?.(new Error(`Speech playback failed (${event.error}).`));
  };

  pendingSpeakTimer = window.setTimeout(() => {
    pendingSpeakTimer = null;

    if (activeUtterance !== utterance) {
      return;
    }

    window.speechSynthesis.resume();
    window.speechSynthesis.speak(utterance);
  }, SPEAK_AFTER_CANCEL_DELAY_MS);

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
    clearActiveUtterance();
    window.speechSynthesis.cancel();
  }
}

function clearActiveUtterance() {
  window.clearTimeout(pendingSpeakTimer);
  pendingSpeakTimer = null;

  if (!activeUtterance) {
    return;
  }

  activeUtterance.onstart = null;
  activeUtterance.onend = null;
  activeUtterance.onerror = null;
  activeUtterance = null;
}
