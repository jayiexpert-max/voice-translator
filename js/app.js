import { CONFIG } from "./config.js";
import { APP_STATUS } from "./constants.js";
import { resetState, state } from "./state.js";
import {
  keepLanguagesDifferent,
  populateLanguageSelector,
} from "./components/languageSelector.js";
import { initToast, showToast } from "./components/toast.js";
import { getLanguage, getSpeechLanguageCode } from "./data/languages.js";
import { formatVoiceLabel, sortVoicesForLanguage } from "./data/voices.js";
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
import { buildAiSummaryPackage, summarizeConversation } from "./services/summaryService.js";
import { copyToClipboard } from "./utils/clipboard.js";
import { downloadTextFile } from "./utils/download.js";
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
  summarizeButton: getElement("summarizeButton"),
  exportSummaryButton: getElement("exportSummaryButton"),
  originalText: getElement("originalText"),
  translatedText: getElement("translatedText"),
  transcriptCount: getElement("transcriptCount"),
  translationCount: getElement("translationCount"),
  summaryOutput: getElement("summaryOutput"),
  summaryCount: getElement("summaryCount"),
  statusPill: getElement("statusPill"),
  supportNotice: getElement("supportNotice"),
  toastRegion: getElement("toastRegion"),
  apiEndpoint: getElement("apiEndpoint"),
  apiKey: getElement("apiKey"),
  sourceLanguageSelect: getElement("sourceLanguageSelect"),
  targetLanguageSelect: getElement("targetLanguageSelect"),
  swapLanguagesButton: getElement("swapLanguagesButton"),
  directionLabel: getElement("directionLabel"),
  originalHeading: getElement("originalHeading"),
  translatedHeading: getElement("translatedHeading"),
  playbackHeading: getElement("playbackHeading"),
};

let recognition;
let shouldKeepListening = false;
let lastTranslatedTranscript = "";
let lastRecognitionFinalTranscript = "";
let ignoreRecognitionError = false;
let transcriptLines = [];
let translationLines = [];
let fullTranscriptLines = [];
let fullTranslationLines = [];
let interimTranslationText = "";
let pendingInterimTranslation = null;
let pendingFinalTranslations = [];
let completedFinalTranslations = new Map();
let activeTranslationCount = 0;
let translationSessionId = 0;
let nextTranslationRequestId = 0;
let nextFinalTranslationSequence = 0;
let nextFinalSequenceToDisplay = 1;
let latestAppliedInterimRequestId = 0;
let latestQueuedFinalRequestId = 0;
let lastInterimTranslationAt = 0;
let lastQueuedTranslationText = "";
let recognitionRestartTimer = null;

const MAX_SUBTITLE_LINES = 3;
const INTERIM_TRANSLATION_INTERVAL_MS = 700;
const INTERIM_TRANSLATION_WORD_LIMIT = 24;
const MAX_CONCURRENT_TRANSLATIONS = 2;

function getStoredEndpoint() {
  return localStorage.getItem(CONFIG.translationEndpointStorageKey) || CONFIG.translationEndpoint;
}

function getStoredApiKey() {
  return localStorage.getItem(CONFIG.translationApiKeyStorageKey) || "";
}

function updateStatus(status) {
  elements.statusPill.textContent = status;
  elements.statusPill.classList.toggle("is-listening", status === APP_STATUS.LISTENING);
  elements.statusPill.classList.toggle("is-loading", status === APP_STATUS.SUMMARIZING || status === APP_STATUS.TRANSLATING);
  elements.statusPill.classList.toggle("is-speaking", status === APP_STATUS.SPEAKING);
}

function updateCharacterCounts() {
  elements.transcriptCount.textContent = `${state.transcript.length} characters`;
  elements.translationCount.textContent = `${state.translation.length} characters`;
  elements.summaryCount.textContent = `${state.summary.length} characters`;
}

function renderLanguageLabels() {
  const source = getLanguage(state.sourceLanguage);
  const target = getLanguage(state.targetLanguage);

  elements.directionLabel.textContent = `${source.name} speech to ${target.name} text`;
  elements.originalHeading.textContent = `Original ${source.name}`;
  elements.translatedHeading.textContent = `${target.name} Translation`;
  elements.playbackHeading.textContent = `${target.name} Speech Playback`;
  elements.copyButton.textContent = `Copy ${target.name} Text`;
  elements.voiceSelect.options[0].textContent = `Auto ${target.name} voice`;
}

function renderSummaryOutput() {
  if (!state.summary) {
    setText(
      elements.summaryOutput,
      "Stop recording, then generate an English summary of the full conversation.",
      true,
    );
    return;
  }

  const fragment = document.createDocumentFragment();
  let currentSection = null;
  let currentList = null;

  for (const rawLine of state.summary.split("\n")) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    if (line.startsWith("# ")) {
      const title = document.createElement("h3");
      title.className = "summary-document-title";
      title.textContent = line.slice(2);
      fragment.appendChild(title);
      currentSection = null;
      currentList = null;
      continue;
    }

    if (line.startsWith("> ")) {
      const metadata = document.createElement("p");
      metadata.className = "summary-meta";
      metadata.textContent = line.slice(2);
      fragment.appendChild(metadata);
      continue;
    }

    if (line.startsWith("## ")) {
      currentSection = document.createElement("article");
      currentSection.className = "summary-section";
      const heading = document.createElement("h3");
      heading.textContent = line.slice(3);
      currentSection.appendChild(heading);
      fragment.appendChild(currentSection);
      currentList = null;
      continue;
    }

    if (line.startsWith("- ")) {
      if (!currentList) {
        currentList = document.createElement("ul");
        (currentSection || fragment).appendChild(currentList);
      }

      const item = document.createElement("li");
      item.textContent = line.slice(2);
      currentList.appendChild(item);
      continue;
    }

    const paragraph = document.createElement("p");
    paragraph.textContent = line;
    (currentSection || fragment).appendChild(paragraph);
    currentList = null;
  }

  elements.summaryOutput.classList.remove("placeholder");
  elements.summaryOutput.replaceChildren(fragment);
}

function render() {
  const source = getLanguage(state.sourceLanguage);
  const target = getLanguage(state.targetLanguage);
  setText(elements.originalText, state.transcript || source.emptyOriginal, !state.transcript);
  setText(elements.translatedText, state.translation || target.emptyTranslation, !state.translation);
  renderSummaryOutput();
  renderLanguageLabels();
  elements.originalText.scrollTop = elements.originalText.scrollHeight;
  elements.translatedText.scrollTop = elements.translatedText.scrollHeight;
  updateCharacterCounts();

  setDisabled(elements.recordButton, state.isListening || state.isTranslating);
  setDisabled(elements.stopButton, !state.isListening);
  setDisabled(elements.copyButton, !state.translation);
  setDisabled(
    elements.summarizeButton,
    state.isListening || state.isTranslating || state.isSummarizing || fullTranscriptLines.length === 0,
  );
  setDisabled(
    elements.exportSummaryButton,
    state.isListening || state.isTranslating || state.isSummarizing || fullTranscriptLines.length === 0,
  );

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
  setDisabled(elements.autoSpeakToggle, !ttsSupported || !CONFIG.autoSpeakEnabled);
}

function normalizeTranscript(text) {
  return text.trim().replace(/\s+/g, " ");
}

function getInterimTranslationWindow(text) {
  return text.split(" ").slice(-INTERIM_TRANSLATION_WORD_LIMIT).join(" ");
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
  fullTranslationLines.push(text);
  translationLines.push(text);
  trimSubtitleLines();
  syncSubtitleText();
}

function trimSubtitleLines() {
  transcriptLines = transcriptLines.slice(-MAX_SUBTITLE_LINES);
  translationLines = translationLines.slice(-MAX_SUBTITLE_LINES);
}

function syncSubtitleText() {
  state.transcript = transcriptLines.slice(-MAX_SUBTITLE_LINES).join("\n");
  state.translation = [...translationLines, interimTranslationText]
    .filter(Boolean)
    .slice(-MAX_SUBTITLE_LINES)
    .join("\n");
}

function hasPendingTranslations() {
  return pendingFinalTranslations.length > 0 || Boolean(pendingInterimTranslation);
}

function clearRecognitionRestartTimer() {
  window.clearTimeout(recognitionRestartTimer);
  recognitionRestartTimer = null;
}

function scheduleRecognitionRestart() {
  if (!shouldKeepListening || recognitionRestartTimer) {
    return;
  }

  recognitionRestartTimer = window.setTimeout(() => {
    recognitionRestartTimer = null;

    if (!shouldKeepListening) {
      return;
    }

    try {
      recognition?.start();
    } catch {
      scheduleRecognitionRestart();
    }
  }, CONFIG.recognitionRestartDelayMs);
}

function isRecoverableRecognitionError(code) {
  return ["aborted", "network", "no-speech"].includes(code);
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
    state.isSpeaking = true;
    state.isSpeechPaused = false;
    updateStatus(APP_STATUS.SPEAKING);
    render();

    speakText({
      text,
      languageCode: getSpeechLanguageCode(state.targetLanguage),
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
    setSpeechIdleStatus();
    showToast(error.message, "error");
  }
}

async function runTranslation({
  transcript,
  sessionId,
  requestId,
  finalSequence,
  shouldSpeak,
  isInterim,
}) {
  if (sessionId !== translationSessionId) {
    return;
  }

  state.isTranslating = true;
  updateStatus(APP_STATUS.TRANSLATING);
  render();
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
      showToast(`Translated to ${getLanguage(state.targetLanguage).name}.`, "success");
    }
  } catch (error) {
    if (!isInterim) {
      updateStatus(APP_STATUS.ERROR);
      showToast(error.message, "error");
    }
  } finally {
    if (sessionId !== translationSessionId) {
      state.isTranslating = activeTranslationCount > 1 || hasPendingTranslations();
      render();
      return;
    }

    if (isInterim) {
      if (
        translatedLine &&
        requestId > latestQueuedFinalRequestId &&
        requestId >= latestAppliedInterimRequestId
      ) {
        latestAppliedInterimRequestId = requestId;
        interimTranslationText = translatedLine;
        syncSubtitleText();
      }
    } else {
      completedFinalTranslations.set(finalSequence, translatedLine);
      flushCompletedFinalTranslations();
    }

    state.isTranslating = activeTranslationCount > 1 || hasPendingTranslations();

    if (translatedLine && shouldSpeak && state.autoSpeak && isTextToSpeechSupported()) {
      speakTranslation(translatedLine);
    }

    if (state.isListening) {
      updateStatus(APP_STATUS.LISTENING);
    } else if (!state.isSpeaking && elements.statusPill.textContent !== APP_STATUS.ERROR) {
      updateStatus(APP_STATUS.READY);
    }

    render();
  }
}

function flushCompletedFinalTranslations() {
  while (completedFinalTranslations.has(nextFinalSequenceToDisplay)) {
    const translatedLine = completedFinalTranslations.get(nextFinalSequenceToDisplay);
    completedFinalTranslations.delete(nextFinalSequenceToDisplay);
    nextFinalSequenceToDisplay += 1;

    if (translatedLine) {
      interimTranslationText = "";
      appendTranslationLine(translatedLine);
    }
  }
}

function enqueueTranslation(transcript, { shouldSpeak = true, isInterim = false } = {}) {
  const translation = {
    transcript,
    sessionId: translationSessionId,
    requestId: ++nextTranslationRequestId,
    shouldSpeak,
    isInterim,
  };

  if (isInterim) {
    pendingInterimTranslation = translation;
  } else {
    translation.finalSequence = ++nextFinalTranslationSequence;
    latestQueuedFinalRequestId = translation.requestId;
    pendingFinalTranslations.push(translation);
  }

  processTranslationQueue();
}

function processTranslationQueue() {
  while (hasPendingTranslations() && activeTranslationCount < MAX_CONCURRENT_TRANSLATIONS) {
    const translation = pendingFinalTranslations.shift() || pendingInterimTranslation;

    if (translation === pendingInterimTranslation) {
      pendingInterimTranslation = null;
    }

    activeTranslationCount += 1;

    runTranslation(translation).finally(() => {
      activeTranslationCount -= 1;
      state.isTranslating = activeTranslationCount > 0 || hasPendingTranslations();
      render();
      processTranslationQueue();
    });
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
  state.summary = "";
  lastTranslatedTranscript = "";
  lastRecognitionFinalTranscript = "";
  transcriptLines = [];
  translationLines = [];
  fullTranscriptLines = [];
  fullTranslationLines = [];
  interimTranslationText = "";
  pendingInterimTranslation = null;
  pendingFinalTranslations = [];
  completedFinalTranslations = new Map();
  translationSessionId += 1;
  nextFinalTranslationSequence = 0;
  nextFinalSequenceToDisplay = 1;
  latestAppliedInterimRequestId = 0;
  latestQueuedFinalRequestId = 0;
  lastInterimTranslationAt = 0;
  lastQueuedTranslationText = "";
  shouldKeepListening = true;
  ignoreRecognitionError = false;
  let hasShownListeningNotice = false;

  recognition = createSpeechRecognition({
    language: getSpeechLanguageCode(state.sourceLanguage),
    continuous: true,
    interimResults: true,
    onStart: () => {
      clearRecognitionRestartTimer();
      state.isListening = true;
      updateStatus(APP_STATUS.LISTENING);
      render();

      if (!hasShownListeningNotice) {
        hasShownListeningNotice = true;
        showToast("Listening until you press Stop.", "info");
      }
    },
    onResult: ({ finalTranscript, interimTranscript, isFinal }) => {
      const normalizedInterimTranscript = normalizeTranscript(interimTranscript);
      const normalizedFinalTranscript = normalizeTranscript(finalTranscript);
      renderSubtitleTranscript(normalizedInterimTranscript);

      const now = Date.now();
      const interimWindow = getInterimTranslationWindow(normalizedInterimTranscript);
      if (
        interimWindow.length >= 3 &&
        interimWindow !== lastQueuedTranslationText &&
        now - lastInterimTranslationAt >= INTERIM_TRANSLATION_INTERVAL_MS
      ) {
        lastInterimTranslationAt = now;
        lastQueuedTranslationText = interimWindow;
        enqueueTranslation(interimWindow, { shouldSpeak: false, isInterim: true });
      }

      if (isFinal && normalizedFinalTranscript && normalizedFinalTranscript !== lastTranslatedTranscript) {
        const newFinalSegment = getTranscriptDelta(normalizedFinalTranscript);

        if (newFinalSegment) {
          fullTranscriptLines.push(newFinalSegment);
          transcriptLines.push(newFinalSegment);
          trimSubtitleLines();
          renderSubtitleTranscript();
        }

        if (newFinalSegment && newFinalSegment !== lastTranslatedTranscript) {
          lastTranslatedTranscript = newFinalSegment;
          lastQueuedTranslationText = newFinalSegment;
          enqueueTranslation(newFinalSegment);
        }
      }
    },
    onEnd: () => {
      if (shouldKeepListening) {
        scheduleRecognitionRestart();

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

      if (shouldKeepListening && isRecoverableRecognitionError(error.code)) {
        scheduleRecognitionRestart();
        return;
      }

      state.isListening = false;
      shouldKeepListening = false;
      clearRecognitionRestartTimer();
      updateStatus(APP_STATUS.ERROR);
      render();
      showToast(error.message, "error");
    },
  });

  try {
    recognition.start();
  } catch (error) {
    shouldKeepListening = false;
    clearRecognitionRestartTimer();
    showToast(error.message, "error");
  }
}

function stopRecording() {
  shouldKeepListening = false;
  state.isListening = false;
  clearRecognitionRestartTimer();
  recognition?.stop();
  updateStatus(state.isTranslating ? APP_STATUS.TRANSLATING : APP_STATUS.READY);
  render();
}

function clearAll() {
  shouldKeepListening = false;
  ignoreRecognitionError = true;
  clearRecognitionRestartTimer();
  recognition?.abort?.();
  stopSpeech();
  lastTranslatedTranscript = "";
  lastRecognitionFinalTranscript = "";
  transcriptLines = [];
  translationLines = [];
  fullTranscriptLines = [];
  fullTranslationLines = [];
  interimTranslationText = "";
  pendingInterimTranslation = null;
  pendingFinalTranslations = [];
  completedFinalTranslations = new Map();
  translationSessionId += 1;
  nextFinalTranslationSequence = 0;
  nextFinalSequenceToDisplay = 1;
  latestAppliedInterimRequestId = 0;
  latestQueuedFinalRequestId = 0;
  lastInterimTranslationAt = 0;
  lastQueuedTranslationText = "";
  resetState();
  updateStatus(APP_STATUS.READY);
  render();
  showToast("Cleared.", "info");
}

async function generateSummary() {
  if (fullTranscriptLines.length === 0 || state.isListening || state.isTranslating) {
    return;
  }

  state.isSummarizing = true;
  updateStatus(APP_STATUS.SUMMARIZING);
  render();

  try {
    const sourceIsEnglish = state.sourceLanguage === "en";
    const hasCompleteEnglishTranslation =
      state.targetLanguage === "en" && fullTranslationLines.length === fullTranscriptLines.length;

    if (!sourceIsEnglish && !hasCompleteEnglishTranslation) {
      throw new Error("A complete English translation is required before generating the summary.");
    }

    state.summary = await summarizeConversation({
      segments: sourceIsEnglish ? fullTranscriptLines : fullTranslationLines,
    });
    showToast("English conversation summary created.", "success");
  } catch (error) {
    updateStatus(APP_STATUS.ERROR);
    showToast(error.message, "error");
  } finally {
    state.isSummarizing = false;

    if (elements.statusPill.textContent !== APP_STATUS.ERROR) {
      updateStatus(APP_STATUS.READY);
    }

    render();
  }
}

function exportSummary() {
  if (fullTranscriptLines.length === 0 || state.isListening || state.isTranslating) {
    return;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const source = getLanguage(state.sourceLanguage);
  const target = getLanguage(state.targetLanguage);
  const aiReviewPackage = buildAiSummaryPackage({
    preliminarySummary: state.summary,
    sourceSegments: fullTranscriptLines,
    translatedSegments: fullTranslationLines,
    sourceLanguage: source.name,
    targetLanguage: target.name,
  });
  downloadTextFile({
    content: aiReviewPackage,
    filename: `conversation-for-ai-review-${timestamp}.md`,
    type: "text/markdown;charset=utf-8",
  });
  showToast("AI review package exported as Markdown.", "success");
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
  const storedAutoSpeak = localStorage.getItem(CONFIG.autoSpeakStorageKey);
  elements.autoSpeakToggle.checked =
    CONFIG.autoSpeakEnabled &&
    (storedAutoSpeak === null ? CONFIG.defaultAutoSpeak : storedAutoSpeak === "true");
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
  const target = getLanguage(state.targetLanguage);
  const sortedVoices = sortVoicesForLanguage(state.voices, target.speechCode);
  const fragment = document.createDocumentFragment();
  const automaticOption = document.createElement("option");
  automaticOption.value = "";
  automaticOption.textContent = `Auto ${target.name} voice`;
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

function updateLanguageSelection() {
  state.sourceLanguage = elements.sourceLanguageSelect.value;
  state.targetLanguage = elements.targetLanguageSelect.value;
  state.recognitionLanguage = getSpeechLanguageCode(state.sourceLanguage);
  renderVoiceOptions();
  render();
}

function changeSourceLanguage() {
  keepLanguagesDifferent(elements.sourceLanguageSelect, elements.targetLanguageSelect);
  updateLanguageSelection();
}

function changeTargetLanguage() {
  keepLanguagesDifferent(elements.targetLanguageSelect, elements.sourceLanguageSelect);
  updateLanguageSelection();
}

function swapLanguages() {
  stopRecording();
  stopSpeech();
  state.isSpeaking = false;
  state.isSpeechPaused = false;
  const sourceLanguage = state.sourceLanguage;
  state.sourceLanguage = state.targetLanguage;
  state.targetLanguage = sourceLanguage;
  state.recognitionLanguage = getSpeechLanguageCode(state.sourceLanguage);
  elements.sourceLanguageSelect.value = state.sourceLanguage;
  elements.targetLanguageSelect.value = state.targetLanguage;
  clearAll();
  renderVoiceOptions();
  showToast(`Switched to ${getLanguage(state.sourceLanguage).name} to ${getLanguage(state.targetLanguage).name}.`, "info");
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

  populateLanguageSelector(elements.sourceLanguageSelect, state.sourceLanguage);
  populateLanguageSelector(elements.targetLanguageSelect, state.targetLanguage);
  elements.sourceLanguageSelect.addEventListener("change", changeSourceLanguage);
  elements.targetLanguageSelect.addEventListener("change", changeTargetLanguage);
  elements.swapLanguagesButton.addEventListener("click", swapLanguages);

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
  elements.summarizeButton.addEventListener("click", generateSummary);
  elements.exportSummaryButton.addEventListener("click", exportSummary);
  elements.copyButton.addEventListener("click", async () => {
    try {
      await copyToClipboard(state.translation);
      showToast(`${getLanguage(state.targetLanguage).name} text copied.`, "success");
    } catch (error) {
      showToast(error.message, "error");
    }
  });

  updateStatus(APP_STATUS.READY);
  render();
  initTextToSpeech();
}

init();
