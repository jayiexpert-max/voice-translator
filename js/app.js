import { CONFIG } from "./config.js";
import { APP_STATUS, EMPTY_TEXT } from "./constants.js";
import { resetState, state } from "./state.js";
import { initToast, showToast } from "./components/toast.js";
import { TARGET_TTS_LANGUAGE, formatVoiceLabel, sortVoicesForLanguage } from "./data/voices.js";
import { createSpeechRecognition, isSpeechRecognitionSupported } from "./services/speechRecognitionService.js";
import {
  isTextToSpeechSupported,
  loadVoices,
  pauseSpeech,
  resumeSpeech,
  speakText,
  stopSpeech,
} from "./services/textToSpeechService.js";
import { translateText } from "./services/translationService.js";
import { canTransliterate, transliterateEnglishToThai } from "./services/transliterationService.js";
import { copyToClipboard } from "./utils/clipboard.js";
import { getElement, setDisabled, setText } from "./utils/dom.js";

const elements = {
  recordButton: getElement("recordButton"),
  stopButton: getElement("stopButton"),
  speakButton: getElement("speakButton"),
  pauseSpeechButton: getElement("pauseSpeechButton"),
  resumeSpeechButton: getElement("resumeSpeechButton"),
  stopSpeechButton: getElement("stopSpeechButton"),
  autoSpeakToggle: getElement("autoSpeakToggle"),
  voiceSelect: getElement("voiceSelect"),
  refreshVoicesButton: getElement("refreshVoicesButton"),
  copyButton: getElement("copyButton"),
  clearButton: getElement("clearButton"),
  originalText: getElement("originalText"),
  translatedText: getElement("translatedText"),
  transcriptCount: getElement("transcriptCount"),
  translationCount: getElement("translationCount"),
  statusPill: getElement("statusPill"),
  supportNotice: getElement("supportNotice"),
  toastRegion: getElement("toastRegion"),
  apiEndpoint: getElement("apiEndpoint"),
  apiKey: getElement("apiKey"),
};

let recognition;
let shouldKeepListening = false;
let lastTranslatedTranscript = "";
let lastRecognitionFinalTranscript = "";
let ignoreRecognitionError = false;
let lastNoSpeechNoticeAt = 0;
let transcriptLines = [];
let translationLines = [];

const NO_SPEECH_NOTICE_COOLDOWN_MS = 4000;
const MAX_SUBTITLE_LINES = 3;

function getStoredEndpoint() {
  return localStorage.getItem(CONFIG.translationEndpointStorageKey) || CONFIG.translationEndpoint;
}

function getStoredApiKey() {
  return localStorage.getItem(CONFIG.translationApiKeyStorageKey) || "";
}

function updateStatus(status) {
  elements.statusPill.textContent = status;
  elements.statusPill.classList.toggle("is-listening", status === APP_STATUS.LISTENING);
  elements.statusPill.classList.toggle("is-loading", status === APP_STATUS.TRANSLATING);
  elements.statusPill.classList.toggle("is-speaking", status === APP_STATUS.SPEAKING);
}

function updateCharacterCounts() {
  elements.transcriptCount.textContent = `${state.transcript.length} characters`;
  elements.translationCount.textContent = `${state.translation.length} characters`;
}

function render() {
  setText(elements.originalText, state.transcript || EMPTY_TEXT.original, !state.transcript);
  setText(elements.translatedText, state.translation || EMPTY_TEXT.translated, !state.translation);
  elements.originalText.scrollTop = elements.originalText.scrollHeight;
  elements.translatedText.scrollTop = elements.translatedText.scrollHeight;
  updateCharacterCounts();

  setDisabled(elements.recordButton, state.isListening || state.isTranslating);
  setDisabled(elements.stopButton, !state.isListening);
  setDisabled(elements.copyButton, !state.translation);

  const ttsSupported = isTextToSpeechSupported();
  setDisabled(
    elements.speakButton,
    !ttsSupported ||
      !state.translation ||
      state.isListening ||
      state.isTranslating ||
      state.isSpeaking ||
      state.isSpeechPaused,
  );
  setDisabled(elements.pauseSpeechButton, !ttsSupported || !state.isSpeaking || state.isSpeechPaused);
  setDisabled(elements.resumeSpeechButton, !ttsSupported || !state.isSpeechPaused);
  setDisabled(elements.stopSpeechButton, !ttsSupported || (!state.isSpeaking && !state.isSpeechPaused));
  setDisabled(elements.voiceSelect, !ttsSupported || state.voices.length === 0);
  setDisabled(elements.refreshVoicesButton, !ttsSupported);
  setDisabled(elements.autoSpeakToggle, !ttsSupported);
}

function normalizeTranscript(text) {
  return text.trim().replace(/\s+/g, " ");
}

function getTranscriptDelta(currentFinalTranscript) {
  if (!currentFinalTranscript) {
    return "";
  }

  if (!lastRecognitionFinalTranscript) {
    lastRecognitionFinalTranscript = currentFinalTranscript;
    return currentFinalTranscript;
  }

  if (currentFinalTranscript.startsWith(lastRecognitionFinalTranscript)) {
    const delta = normalizeTranscript(currentFinalTranscript.slice(lastRecognitionFinalTranscript.length));
    lastRecognitionFinalTranscript = currentFinalTranscript;
    return delta;
  }

  lastRecognitionFinalTranscript = currentFinalTranscript;
  return currentFinalTranscript;
}

function renderSubtitleTranscript(interimTranscript = "") {
  const lines = transcriptLines.slice(-MAX_SUBTITLE_LINES);

  if (interimTranscript) {
    lines.push(`${interimTranscript} ...`);
  }

  state.transcript = lines.join("\n");
  render();
}

function appendTranslationLine(text) {
  translationLines.push(text);
  trimSubtitleLines();
  syncSubtitleText();

  return translationLines.length - 1;
}

function setTranslationLine(index, text) {
  translationLines[index] = text;
  trimSubtitleLines();
  syncSubtitleText();
}

function trimSubtitleLines() {
  const overflow = Math.max(transcriptLines.length, translationLines.length) - MAX_SUBTITLE_LINES;

  if (overflow <= 0) {
    return;
  }

  transcriptLines = transcriptLines.slice(overflow);
  translationLines = translationLines.slice(overflow);
}

function syncSubtitleText() {
  state.transcript = transcriptLines.slice(-MAX_SUBTITLE_LINES).join("\n");
  state.translation = translationLines.slice(-MAX_SUBTITLE_LINES).filter(Boolean).join("\n");
}

function notifyNoSpeechDetected() {
  const now = Date.now();

  if (now - lastNoSpeechNoticeAt < NO_SPEECH_NOTICE_COOLDOWN_MS) {
    return;
  }

  lastNoSpeechNoticeAt = now;
  updateStatus(APP_STATUS.LISTENING);
  showToast("No speech detected. Still listening until Stop.", "info");
  render();
}

function setSpeechIdleStatus() {
  state.isSpeaking = false;
  state.isSpeechPaused = false;

  if (state.isListening) {
    updateStatus(APP_STATUS.LISTENING);
  } else if (!state.isTranslating && elements.statusPill.textContent !== APP_STATUS.ERROR) {
    updateStatus(APP_STATUS.READY);
  }

  render();
}

function speakTranslation(text = state.translation) {
  try {
    speakText({
      text,
      languageCode: TARGET_TTS_LANGUAGE,
      voices: state.voices,
      voiceURI: state.selectedVoiceURI,
      onStart: (voice) => {
        state.isSpeaking = true;
        state.isSpeechPaused = false;
        updateStatus(APP_STATUS.SPEAKING);
        render();

        if (!voice) {
          showToast("Speaking with the browser default voice.", "info");
        }
      },
      onEnd: setSpeechIdleStatus,
      onError: (error) => {
        updateStatus(APP_STATUS.ERROR);
        setSpeechIdleStatus();
        showToast(error.message, "error");
      },
    });
  } catch (error) {
    showToast(error.message, "error");
  }
}

async function runTranslation(transcript) {
  state.isTranslating = true;
  updateStatus(APP_STATUS.TRANSLATING);
  const translationLineIndex = appendTranslationLine("Translating...");
  render();
  let usedTransliterationFallback = false;
  let translatedLine = "";

  try {
    translatedLine = await translateText({
      text: transcript,
      sourceLanguage: state.sourceLanguage,
      targetLanguage: state.targetLanguage,
      endpoint: elements.apiEndpoint.value.trim(),
      apiKey: elements.apiKey.value.trim(),
    });

    if (!state.isListening) {
      showToast("Translated to Thai.", "success");
    }
  } catch (error) {
    if (canTransliterate(state.sourceLanguage, state.targetLanguage)) {
      translatedLine = transliterateEnglishToThai(transcript);
      usedTransliterationFallback = true;
      showToast("Translation failed, so transliteration was used.", "info");
    } else {
      updateStatus(APP_STATUS.ERROR);
      showToast(error.message, "error");
    }
  } finally {
    if (translatedLine) {
      setTranslationLine(translationLineIndex, translatedLine);
    } else {
      setTranslationLine(translationLineIndex, "");
    }

    state.isTranslating = false;

    if (translatedLine && state.autoSpeak && isTextToSpeechSupported()) {
      speakTranslation(translatedLine);
    }

    if (state.isListening) {
      updateStatus(APP_STATUS.LISTENING);
    } else if (!state.isSpeaking && elements.statusPill.textContent !== APP_STATUS.ERROR) {
      updateStatus(APP_STATUS.READY);
    }

    if (usedTransliterationFallback && !state.isListening && !state.isSpeaking) {
      updateStatus(APP_STATUS.READY);
    }

    render();
  }
}

function startRecording() {
  if (!isSpeechRecognitionSupported()) {
    showToast("Speech recognition is not supported in this browser.", "error");
    return;
  }

  stopSpeech();
  state.isSpeaking = false;
  state.isSpeechPaused = false;
  state.transcript = "";
  state.translation = "";
  lastTranslatedTranscript = "";
  lastRecognitionFinalTranscript = "";
  lastNoSpeechNoticeAt = 0;
  transcriptLines = [];
  translationLines = [];
  shouldKeepListening = true;

  recognition = createSpeechRecognition({
    language: state.recognitionLanguage,
    continuous: true,
    interimResults: true,
    onStart: () => {
      state.isListening = true;
      updateStatus(APP_STATUS.LISTENING);
      render();
      showToast("Listening until you press Stop.", "info");
    },
    onResult: ({ finalTranscript, interimTranscript, isFinal }) => {
      const normalizedInterimTranscript = normalizeTranscript(interimTranscript);
      const normalizedFinalTranscript = normalizeTranscript(finalTranscript);
      renderSubtitleTranscript(normalizedInterimTranscript);

      if (isFinal && normalizedFinalTranscript && normalizedFinalTranscript !== lastTranslatedTranscript) {
        const newFinalSegment = getTranscriptDelta(normalizedFinalTranscript);

        if (newFinalSegment) {
          transcriptLines.push(newFinalSegment);
          trimSubtitleLines();
          renderSubtitleTranscript();
        }

        if (newFinalSegment && newFinalSegment !== lastTranslatedTranscript) {
          lastTranslatedTranscript = newFinalSegment;
          runTranslation(newFinalSegment);
        }
      }
    },
    onEnd: () => {
      if (shouldKeepListening) {
        try {
          recognition?.start();
        } catch (error) {
          state.isListening = false;
          shouldKeepListening = false;
          updateStatus(APP_STATUS.ERROR);
          showToast(error.message, "error");
          render();
        }

        return;
      }

      state.isListening = false;
      if (!state.isTranslating && !state.isSpeaking && elements.statusPill.textContent !== APP_STATUS.ERROR) {
        updateStatus(APP_STATUS.READY);
      }
      render();
    },
    onError: (error) => {
      if (ignoreRecognitionError) {
        ignoreRecognitionError = false;
        return;
      }

      if (shouldKeepListening && error.code === "no-speech") {
        notifyNoSpeechDetected();
        return;
      }

      if (shouldKeepListening && error.code === "aborted") {
        return;
      }

      state.isListening = false;
      shouldKeepListening = false;
      updateStatus(APP_STATUS.ERROR);
      render();
      showToast(error.message, "error");
    },
  });

  try {
    recognition.start();
  } catch (error) {
    showToast(error.message, "error");
  }
}

function stopRecording() {
  shouldKeepListening = false;
  state.isListening = false;
  recognition?.stop();
  updateStatus(state.isTranslating ? APP_STATUS.TRANSLATING : APP_STATUS.READY);
  render();
}

function clearAll() {
  shouldKeepListening = false;
  ignoreRecognitionError = true;
  recognition?.abort?.();
  stopSpeech();
  lastTranslatedTranscript = "";
  lastRecognitionFinalTranscript = "";
  lastNoSpeechNoticeAt = 0;
  transcriptLines = [];
  translationLines = [];
  resetState();
  updateStatus(APP_STATUS.READY);
  render();
  showToast("Cleared.", "info");
}

function persistSettings() {
  localStorage.setItem(CONFIG.translationEndpointStorageKey, elements.apiEndpoint.value.trim());
  localStorage.setItem(CONFIG.translationApiKeyStorageKey, elements.apiKey.value.trim());
  localStorage.setItem(CONFIG.autoSpeakStorageKey, String(elements.autoSpeakToggle.checked));
  localStorage.setItem(CONFIG.selectedVoiceStorageKey, elements.voiceSelect.value);
}

function initSettings() {
  elements.apiEndpoint.value = getStoredEndpoint();
  elements.apiKey.value = getStoredApiKey();
  elements.autoSpeakToggle.checked = localStorage.getItem(CONFIG.autoSpeakStorageKey) === "true";
  state.autoSpeak = elements.autoSpeakToggle.checked;
  state.selectedVoiceURI = localStorage.getItem(CONFIG.selectedVoiceStorageKey) || "";

  elements.apiEndpoint.addEventListener("change", persistSettings);
  elements.apiKey.addEventListener("change", persistSettings);
  elements.autoSpeakToggle.addEventListener("change", () => {
    state.autoSpeak = elements.autoSpeakToggle.checked;
    persistSettings();
  });
  elements.voiceSelect.addEventListener("change", () => {
    state.selectedVoiceURI = elements.voiceSelect.value;
    persistSettings();
  });
}

function renderVoiceOptions() {
  const sortedVoices = sortVoicesForLanguage(state.voices, TARGET_TTS_LANGUAGE);
  const fragment = document.createDocumentFragment();
  const automaticOption = document.createElement("option");
  automaticOption.value = "";
  automaticOption.textContent = "Auto Thai voice";
  fragment.appendChild(automaticOption);

  sortedVoices.forEach((voice) => {
    const option = document.createElement("option");
    option.value = voice.voiceURI;
    option.textContent = formatVoiceLabel(voice);
    fragment.appendChild(option);
  });

  elements.voiceSelect.replaceChildren(fragment);
  elements.voiceSelect.value = state.selectedVoiceURI;

  if (elements.voiceSelect.value !== state.selectedVoiceURI) {
    state.selectedVoiceURI = "";
    persistSettings();
  }
}

async function initTextToSpeech() {
  if (!isTextToSpeechSupported()) {
    showToast("Text-to-speech is not supported in this browser.", "error");
    render();
    return;
  }

  state.voices = await loadVoices();
  renderVoiceOptions();

  if (state.voices.length === 0) {
    showToast("No browser voices are available yet.", "error");
  }

  render();
}

async function refreshVoices({ showResult = false } = {}) {
  if (!isTextToSpeechSupported()) {
    showToast("Text-to-speech is not supported in this browser.", "error");
    render();
    return;
  }

  state.voices = await loadVoices();
  renderVoiceOptions();
  render();

  if (showResult) {
    const message =
      state.voices.length > 0
        ? `Loaded ${state.voices.length} browser voices.`
        : "No browser voices found. Chrome may need a restart or OS voices installed.";
    showToast(message, state.voices.length > 0 ? "success" : "error");
  }
}

function init() {
  initToast(elements.toastRegion);
  initSettings();

  const supported = isSpeechRecognitionSupported();
  elements.supportNotice.hidden = supported;
  setDisabled(elements.recordButton, !supported);

  elements.recordButton.addEventListener("click", startRecording);
  elements.stopButton.addEventListener("click", stopRecording);
  elements.speakButton.addEventListener("click", () => speakTranslation());
  elements.refreshVoicesButton.addEventListener("click", () => refreshVoices({ showResult: true }));
  elements.pauseSpeechButton.addEventListener("click", () => {
    pauseSpeech();
    state.isSpeechPaused = true;
    updateStatus(APP_STATUS.PAUSED);
    render();
  });
  elements.resumeSpeechButton.addEventListener("click", () => {
    resumeSpeech();
    state.isSpeechPaused = false;
    state.isSpeaking = true;
    updateStatus(APP_STATUS.SPEAKING);
    render();
  });
  elements.stopSpeechButton.addEventListener("click", () => {
    stopSpeech();
    setSpeechIdleStatus();
  });
  elements.clearButton.addEventListener("click", clearAll);
  elements.copyButton.addEventListener("click", async () => {
    try {
      await copyToClipboard(state.translation);
      showToast("Thai text copied.", "success");
    } catch (error) {
      showToast(error.message, "error");
    }
  });

  updateStatus(APP_STATUS.READY);
  render();
  initTextToSpeech();
}

init();
