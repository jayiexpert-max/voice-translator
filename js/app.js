import { CONFIG } from "./config.js";
import { APP_STATUS, AUDIO_SOURCE } from "./constants.js";
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
  acquireMicrophoneStream,
  findPreferredAudioInputDevice,
  formatAudioInputLabel,
  isAudioInputSupported,
  isExternalAudioCaptureDevice,
  isMeetingLoopbackDevice,
  isUsbAudioDevice,
  loadAudioInputDevices,
  releaseMicrophoneStream,
} from "./services/audioInputService.js";
import {
  acquireMeetingAudioStream,
  createContinuousMeetingCapture,
  extractNewMeetingSegment,
  isMeetingAudioSupported,
  releaseMeetingAudioStream,
} from "./services/meetingAudioService.js";
import {
  isPlausibleTranscript,
  preloadMeetingTranscriber,
  transcribeMeetingAudio,
} from "./services/meetingTranscriptionService.js";
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
  pauseRecordingButton: getElement("pauseRecordingButton"),
  resumeRecordingButton: getElement("resumeRecordingButton"),
  stopButton: getElement("stopButton"),
  speakButton: getElement("speakButton"),
  pauseSpeechButton: getElement("pauseSpeechButton"),
  resumeSpeechButton: getElement("resumeSpeechButton"),
  stopSpeechButton: getElement("stopSpeechButton"),
  autoSpeakToggle: getElement("autoSpeakToggle"),
  voiceSelect: getElement("voiceSelect"),
  refreshVoicesButton: getElement("refreshVoicesButton"),
  microphoneSelect: getElement("microphoneSelect"),
  refreshMicrophonesButton: getElement("refreshMicrophonesButton"),
  audioSourceSelect: getElement("audioSourceSelect"),
  audioSourceHint: getElement("audioSourceHint"),
  microphoneRow: getElement("microphoneRow"),
  inputLevelRow: getElement("inputLevelRow"),
  inputLevelMeter: getElement("inputLevelMeter"),
  inputLevelText: getElement("inputLevelText"),
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
  summaryHeading: getElement("summaryHeading"),
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
let microphoneStream = null;
let meetingStream = null;
let meetingCapture = null;
let activeCaptureStreamType = null;
let meetingChunkQueue = [];
let activeMeetingTranscriptions = 0;
let lastMeetingChunkTranscript = "";
let meetingInterimTranscript = "";
let captureAudioDetected = false;
let captureSilenceTimer = null;
let speechModelReady = false;
let speechModelLoading = false;
let drainingCaptureQueue = false;
let recordingSessionActive = false;
let activeCaptureInputLabel = "";
let activeCaptureStreamEndedMessage = "";
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
const INTERIM_TRANSLATION_INTERVAL_MS = 350;
const INTERIM_TRANSLATION_WORD_LIMIT = 24;
const INTERIM_TRANSLATION_CHAR_LIMIT = 72;
const MAX_CONCURRENT_TRANSLATIONS = 3;

function getStoredEndpoint() {
  return localStorage.getItem(CONFIG.translationEndpointStorageKey) || CONFIG.translationEndpoint;
}

function getStoredApiKey() {
  return localStorage.getItem(CONFIG.translationApiKeyStorageKey) || "";
}

function updateStatus(status) {
  elements.statusPill.textContent = status;
  elements.statusPill.classList.toggle("is-listening", status === APP_STATUS.LISTENING);
  elements.statusPill.classList.toggle(
    "is-loading",
    status === APP_STATUS.SUMMARIZING ||
      status === APP_STATUS.TRANSLATING ||
      status === APP_STATUS.TRANSCRIBING,
  );
  elements.statusPill.classList.toggle("is-speaking", status === APP_STATUS.SPEAKING);
}

function updateCharacterCounts() {
  elements.transcriptCount.textContent = `${state.transcript.length} characters`;
  elements.translationCount.textContent = `${state.translation.length} characters`;
  elements.summaryCount.textContent = `${state.summary.length} characters`;
}

function getSummaryUiCopy(sourceLanguageCode) {
  const source = getLanguage(sourceLanguageCode);
  return {
    heading: `${source.name} Conversation Summary`,
    placeholder: `Stop recording, then generate a ${source.name} summary of the full conversation.`,
    button: `Generate ${source.name} Summary`,
    successToast: `${source.name} conversation summary created.`,
  };
}

function renderLanguageLabels() {
  const source = getLanguage(state.sourceLanguage);
  const target = getLanguage(state.targetLanguage);
  const summaryCopy = getSummaryUiCopy(state.sourceLanguage);

  elements.directionLabel.textContent = `${source.name} speech to ${target.name} text`;
  elements.originalHeading.textContent = `Original ${source.name}`;
  elements.translatedHeading.textContent = `${target.name} Translation`;
  elements.playbackHeading.textContent = `${target.name} Speech Playback`;
  elements.copyButton.textContent = `Copy ${target.name} Text`;
  elements.voiceSelect.options[0].textContent = `Auto ${target.name} voice`;
  elements.summaryHeading.textContent = summaryCopy.heading;
  elements.summarizeButton.textContent = summaryCopy.button;
}

function renderSummaryOutput() {
  const summaryCopy = getSummaryUiCopy(state.sourceLanguage);

  if (!state.summary) {
    setText(elements.summaryOutput, summaryCopy.placeholder, true);
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
  renderAudioSourceUi();
  elements.originalText.scrollTop = elements.originalText.scrollHeight;
  elements.translatedText.scrollTop = elements.translatedText.scrollHeight;
  updateCharacterCounts();

  setDisabled(elements.recordButton, state.isListening || state.isTranslating || state.isRecordingPaused);
  setDisabled(elements.pauseRecordingButton, !state.isListening || state.isRecordingPaused);
  setDisabled(elements.resumeRecordingButton, !state.isRecordingPaused);
  elements.pauseRecordingButton.hidden = state.isRecordingPaused;
  elements.resumeRecordingButton.hidden = !state.isRecordingPaused;
  setDisabled(elements.stopButton, !state.isListening && !state.isRecordingPaused);
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

  const audioInputSupported = isAudioInputSupported();
  setDisabled(elements.audioSourceSelect, state.isListening);
  setDisabled(elements.microphoneSelect, !audioInputSupported || state.isListening);
  setDisabled(elements.refreshMicrophonesButton, !audioInputSupported || state.isListening);
}

function getSelectedAudioInputDevice() {
  return state.audioInputDevices.find((device) => device.deviceId === state.selectedAudioInputId) || null;
}

function renderAudioSourceUi() {
  const isMeetingMode = state.audioSource === AUDIO_SOURCE.MEETING;
  elements.microphoneRow.hidden = isMeetingMode;

  if (isMeetingMode) {
    elements.audioSourceHint.textContent =
      "Start recording, choose the Microsoft Teams tab or window, and enable Share audio. Uses a larger speech model for better accuracy; first load may take 1-3 minutes.";
    return;
  }

  const selectedDevice = getSelectedAudioInputDevice();
  const preferredDevice = findPreferredAudioInputDevice(state.audioInputDevices);

  if (selectedDevice && isUsbAudioDevice(selectedDevice)) {
    elements.audioSourceHint.textContent = `Input: ${formatAudioInputLabel(selectedDevice)}. USB audio uses direct capture + speech model (not browser mic). Press Start Recording and wait for the model to load.`;
    return;
  }

  if (selectedDevice && isMeetingLoopbackDevice(selectedDevice)) {
    elements.audioSourceHint.textContent = `Input: ${formatAudioInputLabel(selectedDevice)}. Loopback capture is active for meeting audio.`;
    return;
  }

  if (preferredDevice && /usb audio device/i.test(preferredDevice.label || "")) {
    elements.audioSourceHint.textContent = `USB Audio Device detected. Select "${formatAudioInputLabel(preferredDevice)}" below for Teams loopback input.`;
    return;
  }

  elements.audioSourceHint.textContent =
    "Choose a microphone or USB audio device below. For Teams audio through a USB interface, select USB Audio Device here.";
}

function normalizeTranscript(text) {
  return text.trim().replace(/\s+/g, " ");
}

function getInterimTranslationWindow(text) {
  if (state.sourceLanguage === "th") {
    return text.slice(-INTERIM_TRANSLATION_CHAR_LIMIT).trim();
  }

  return text.split(" ").slice(-INTERIM_TRANSLATION_WORD_LIMIT).join(" ");
}

function hasEnoughInterimText(text) {
  if (state.sourceLanguage === "th") {
    return text.length >= 2;
  }

  return text.length >= 3;
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

function restartRecognitionImmediately() {
  if (!shouldKeepListening) {
    return;
  }

  clearRecognitionRestartTimer();

  try {
    recognition?.start();
  } catch {
    scheduleRecognitionRestart();
  }
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

function releaseActiveMicrophone() {
  releaseMicrophoneStream(microphoneStream);
  microphoneStream = null;
}

async function ensureMicrophoneStream() {
  releaseActiveMicrophone();

  try {
    microphoneStream = await acquireMicrophoneStream(state.selectedAudioInputId, state.audioInputDevices);
  } catch (error) {
    const deviceLabel = state.selectedAudioInputId
      ? formatAudioInputLabel(
          state.audioInputDevices.find((device) => device.deviceId === state.selectedAudioInputId) ?? {
            deviceId: state.selectedAudioInputId,
            label: "",
          },
        )
      : "the selected microphone";

    throw new Error(`Could not open ${deviceLabel}. Check USB connection and browser microphone permission.`);
  }
}

function resetRecordingSession() {
  stopSpeech();
  state.isSpeaking = false;
  state.isSpeechPaused = false;
  state.transcript = "";
  state.translation = "";
  state.summary = "";
  lastTranslatedTranscript = "";
  lastRecognitionFinalTranscript = "";
  lastMeetingChunkTranscript = "";
  meetingInterimTranscript = "";
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
  meetingChunkQueue = [];
  activeMeetingTranscriptions = 0;
  drainingCaptureQueue = false;
  ignoreRecognitionError = false;
}

function resetInputLevelMeter() {
  elements.inputLevelRow.hidden = true;
  elements.inputLevelMeter.value = 0;
  elements.inputLevelText.textContent = "Silent";
}

function updateInputLevelMeter(level) {
  elements.inputLevelRow.hidden = false;
  elements.inputLevelMeter.value = Math.min(level, 0.25);

  if (level < 0.003) {
    elements.inputLevelText.textContent = "Silent";
  } else if (level < 0.02) {
    elements.inputLevelText.textContent = "Low";
  } else if (level < 0.08) {
    elements.inputLevelText.textContent = "Good";
  } else {
    elements.inputLevelText.textContent = "Strong";
  }
}

function beginSpeechModelLoad() {
  if (speechModelLoading || speechModelReady) {
    return;
  }

  speechModelReady = false;
  speechModelLoading = true;

  preloadMeetingTranscriber(state.sourceLanguage)
    .then(() => {
      speechModelReady = true;
      showToast("Speech model ready. Processing audio...", "success");
      processMeetingChunkQueue();
    })
    .catch((error) => {
      showToast(error.message, "error");
    })
    .finally(() => {
      speechModelLoading = false;
    });
}

function maybePreloadSpeechModel() {
  if (state.isListening || speechModelReady || speechModelLoading) {
    return;
  }

  if (state.audioSource === AUDIO_SOURCE.MEETING || usesStreamCapturePipeline()) {
    beginSpeechModelLoad();
  }
}

function usesStreamCapturePipeline() {
  if (state.audioSource === AUDIO_SOURCE.MEETING) {
    return true;
  }

  const device = getSelectedAudioInputDevice();
  return Boolean(device && isExternalAudioCaptureDevice(device));
}

function clearCaptureSilenceTimer() {
  window.clearTimeout(captureSilenceTimer);
  captureSilenceTimer = null;
}

function scheduleCaptureSilenceCheck(inputLabel) {
  clearCaptureSilenceTimer();
  captureAudioDetected = false;

  captureSilenceTimer = window.setTimeout(() => {
    if (!shouldKeepListening || captureAudioDetected) {
      return;
    }

    showToast(
      `No audio detected from ${inputLabel}. Check that Teams output is routed to this device and volume is up.`,
      "error",
    );
  }, 12000);
}

function pauseStreamCapture() {
  meetingCapture?.stop();
  meetingCapture = null;
  clearCaptureSilenceTimer();
  resetInputLevelMeter();
}

function getActiveCaptureStream() {
  return activeCaptureStreamType === "meeting" ? meetingStream : microphoneStream;
}

async function attachStreamCapture(streamType) {
  const captureStream = getActiveCaptureStream();

  if (!captureStream) {
    throw new Error("Audio stream is no longer available. Press Stop, then start recording again.");
  }

  meetingCapture = createContinuousMeetingCapture({
    stream: captureStream,
    windowMs: CONFIG.meetingAudioWindowMs,
    minWindowMs: CONFIG.meetingAudioMinWindowMs,
    hopMs: CONFIG.meetingAudioHopMs,
    minRms: CONFIG.meetingAudioMinRms,
    skipRmsGate: streamType === "microphone",
    targetSampleRate: CONFIG.meetingAudioTargetSampleRate,
    onLevel: updateInputLevelMeter,
    onChunk: handleMeetingChunk,
    onStreamEnded: () => {
      if (shouldKeepListening) {
        showToast(activeCaptureStreamEndedMessage, "info");
        stopRecording();
      }
    },
  });

  await meetingCapture.start();
  activeCaptureStreamType = streamType;
  scheduleCaptureSilenceCheck(activeCaptureInputLabel);
}

function releaseCaptureStreams() {
  if (activeCaptureStreamType === "meeting") {
    releaseMeetingAudioStream(meetingStream);
    meetingStream = null;
  } else if (activeCaptureStreamType === "microphone") {
    releaseActiveMicrophone();
  }

  activeCaptureStreamType = null;
  resetInputLevelMeter();
}

function resetCaptureProcessingState() {
  meetingChunkQueue = [];
  activeMeetingTranscriptions = 0;
  lastMeetingChunkTranscript = "";
  meetingInterimTranscript = "";
  drainingCaptureQueue = false;
}

function stopStreamCaptureRecording({ drainPendingChunks = false } = {}) {
  meetingCapture?.stop();
  meetingCapture = null;
  clearCaptureSilenceTimer();
  releaseCaptureStreams();

  if (drainPendingChunks && speechModelReady && meetingChunkQueue.length > 0) {
    drainingCaptureQueue = true;
    processMeetingChunkQueue();
    return;
  }

  resetCaptureProcessingState();
}

function finishCaptureDrainIfIdle() {
  if (!drainingCaptureQueue || meetingChunkQueue.length > 0 || activeMeetingTranscriptions > 0) {
    return;
  }

  drainingCaptureQueue = false;
  meetingInterimTranscript = "";
  renderSubtitleTranscript();

  if (!state.isTranslating && !state.isSpeaking && elements.statusPill.textContent !== APP_STATUS.ERROR) {
    updateStatus(state.isRecordingPaused ? APP_STATUS.PAUSED : APP_STATUS.READY);
  }

  render();
}

function stopMeetingRecording() {
  stopStreamCaptureRecording();
}

function appendMeetingTranscriptSegment(text) {
  const segment = normalizeTranscript(text);

  if (!segment) {
    return;
  }

  fullTranscriptLines.push(segment);
  transcriptLines.push(segment);
  trimSubtitleLines();
  meetingInterimTranscript = "";
  renderSubtitleTranscript();
  lastQueuedTranslationText = segment;
  enqueueTranslation(segment);
}

function handleMeetingChunk(blob) {
  if (!shouldKeepListening) {
    return;
  }

  captureAudioDetected = true;
  meetingChunkQueue.push(blob);

  while (meetingChunkQueue.length > CONFIG.meetingAudioMaxQueuedChunks) {
    meetingChunkQueue.shift();
  }

  if (!meetingInterimTranscript) {
    meetingInterimTranscript = "...";
    renderSubtitleTranscript(meetingInterimTranscript);
  }

  if (meetingChunkQueue.length === 1 && speechModelReady) {
    showToast("Audio signal received. Transcribing...", "info");
  } else if (meetingChunkQueue.length === 1 && !speechModelReady) {
    showToast("Audio signal received. Waiting for speech model...", "info");
  }

  processMeetingChunkQueue();

  if (!speechModelReady && !speechModelLoading) {
    beginSpeechModelLoad();
  }
}

async function transcribeMeetingChunk(blob) {
  const text = normalizeTranscript(await transcribeMeetingAudio(blob, state.sourceLanguage));

  if (!text || (!shouldKeepListening && !drainingCaptureQueue) || !isPlausibleTranscript(text, state.sourceLanguage)) {
    return;
  }

  const newSegment = extractNewMeetingSegment(
    lastMeetingChunkTranscript,
    text,
    state.sourceLanguage,
  );

  if (!newSegment) {
    return;
  }

  lastMeetingChunkTranscript = text;
  appendMeetingTranscriptSegment(newSegment);

  if (fullTranscriptLines.length === 1) {
    showToast("Speech detected. Translating...", "success");
  }
}

function processMeetingChunkQueue() {
  if (!speechModelReady) {
    return;
  }

  while (
    (shouldKeepListening || drainingCaptureQueue) &&
    activeMeetingTranscriptions < CONFIG.meetingAudioMaxConcurrentTranscriptions &&
    meetingChunkQueue.length > 0
  ) {
    const blob = meetingChunkQueue.shift();
    activeMeetingTranscriptions += 1;
    updateStatus(APP_STATUS.TRANSCRIBING);
    render();

    transcribeMeetingChunk(blob)
      .catch((error) => {
        updateStatus(APP_STATUS.ERROR);
        showToast(error.message, "error");
      })
      .finally(() => {
        activeMeetingTranscriptions -= 1;

        if (shouldKeepListening) {
          updateStatus(
            activeMeetingTranscriptions > 0 || meetingChunkQueue.length > 0
              ? APP_STATUS.TRANSCRIBING
              : APP_STATUS.LISTENING,
          );
        } else if (drainingCaptureQueue) {
          updateStatus(
            activeMeetingTranscriptions > 0 || meetingChunkQueue.length > 0
              ? APP_STATUS.TRANSCRIBING
              : APP_STATUS.READY,
          );
        }

        if (meetingChunkQueue.length === 0 && activeMeetingTranscriptions === 0) {
          meetingInterimTranscript = "";
          renderSubtitleTranscript();
        }

        render();
        processMeetingChunkQueue();
        finishCaptureDrainIfIdle();
      });
  }
}

async function startStreamCaptureRecording({
  streamType,
  acquireStream,
  inputLabel,
  listeningMessage,
  streamEndedMessage,
}) {
  if (!recordingSessionActive) {
    resetRecordingSession();
  }

  recordingSessionActive = true;
  state.isRecordingPaused = false;
  shouldKeepListening = true;
  activeCaptureInputLabel = inputLabel;
  activeCaptureStreamEndedMessage = streamEndedMessage;
  updateStatus(APP_STATUS.LISTENING);
  render();

  try {
    if (!activeCaptureStreamType) {
      await acquireStream();
    }
  } catch (error) {
    shouldKeepListening = false;
    recordingSessionActive = false;
    updateStatus(APP_STATUS.ERROR);
    render();
    showToast(error.message, "error");
    return;
  }

  try {
    await attachStreamCapture(streamType);
  } catch (error) {
    shouldKeepListening = false;
    recordingSessionActive = false;
    releaseCaptureStreams();
    updateStatus(APP_STATUS.ERROR);
    render();
    showToast(error.message, "error");
    return;
  }

  state.isListening = true;
  updateStatus(APP_STATUS.LISTENING);
  render();
  showToast(listeningMessage, "info");

  if (!speechModelReady && !speechModelLoading) {
    showToast("Downloading speech model in the background...", "info");
    beginSpeechModelLoad();
  }
}

async function startMeetingRecording() {
  if (!isMeetingAudioSupported()) {
    showToast("Meeting audio capture is not supported in this browser.", "error");
    return;
  }

  await startStreamCaptureRecording({
    streamType: "meeting",
    inputLabel: "the shared Teams tab or window",
    listeningMessage: "Listening to Teams audio until you press Stop.",
    streamEndedMessage: "Teams share stopped.",
    async acquireStream() {
      meetingStream = await acquireMeetingAudioStream();
    },
  });
}

async function startUsbAudioRecording() {
  const device = getSelectedAudioInputDevice();
  const inputLabel = device ? formatAudioInputLabel(device) : "USB Audio Device";

  await startStreamCaptureRecording({
    streamType: "microphone",
    inputLabel,
    listeningMessage: `Listening to ${inputLabel}. Watch the input level meter.`,
    streamEndedMessage: `${inputLabel} input stopped.`,
    async acquireStream() {
      microphoneStream = await acquireMicrophoneStream(state.selectedAudioInputId, state.audioInputDevices);
    },
  });
}

async function startRecording() {
  if (state.isRecordingPaused) {
    await resumeRecording();
    return;
  }

  if (state.audioSource === AUDIO_SOURCE.MEETING) {
    await startMeetingRecording();
    return;
  }

  if (usesStreamCapturePipeline()) {
    await startUsbAudioRecording();
    return;
  }

  if (!isSpeechRecognitionSupported()) {
    showToast("Speech recognition is not supported in this browser.", "error");
    return;
  }

  resetRecordingSession();
  recordingSessionActive = true;
  state.isRecordingPaused = false;
  shouldKeepListening = true;
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
        showToast("Listening until you press Pause or Stop.", "info");
      }
    },
    onResult: ({ finalTranscript, interimTranscript, isFinal }) => {
      const normalizedInterimTranscript = normalizeTranscript(interimTranscript);
      const normalizedFinalTranscript = normalizeTranscript(finalTranscript);
      renderSubtitleTranscript(normalizedInterimTranscript);

      const now = Date.now();
      const interimWindow = getInterimTranslationWindow(normalizedInterimTranscript);
      if (
        hasEnoughInterimText(interimWindow) &&
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
        restartRecognitionImmediately();
        return;
      }

      state.isListening = false;
      if (state.isRecordingPaused) {
        updateStatus(APP_STATUS.PAUSED);
      } else if (!state.isTranslating && !state.isSpeaking && elements.statusPill.textContent !== APP_STATUS.ERROR) {
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
        restartRecognitionImmediately();
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
    await ensureMicrophoneStream();
    recognition.start();
  } catch (error) {
    shouldKeepListening = false;
    clearRecognitionRestartTimer();
    releaseActiveMicrophone();
    showToast(error.message, "error");
  }
}

function pauseRecording() {
  if (!state.isListening || state.isRecordingPaused) {
    return;
  }

  shouldKeepListening = false;
  state.isListening = false;
  state.isRecordingPaused = true;
  clearRecognitionRestartTimer();
  ignoreRecognitionError = true;
  recognition?.stop();

  if (activeCaptureStreamType) {
    const shouldDrainPendingChunks =
      speechModelReady && (meetingChunkQueue.length > 0 || activeMeetingTranscriptions > 0);
    pauseStreamCapture();

    if (shouldDrainPendingChunks) {
      drainingCaptureQueue = true;
      processMeetingChunkQueue();
      updateStatus(APP_STATUS.TRANSCRIBING);
    } else {
      updateStatus(APP_STATUS.PAUSED);
    }
  } else {
    updateStatus(APP_STATUS.PAUSED);
  }

  showToast("Recording paused. Press Resume to continue or Stop to finish.", "info");
  render();
}

async function resumeRecording() {
  if (!state.isRecordingPaused) {
    return;
  }

  state.isRecordingPaused = false;
  shouldKeepListening = true;

  try {
    if (activeCaptureStreamType) {
      await attachStreamCapture(activeCaptureStreamType);
    } else if (recognition) {
      await ensureMicrophoneStream();
      recognition.start();
    } else {
      throw new Error("Recording session expired. Press Stop, then start again.");
    }

    state.isListening = true;
    updateStatus(APP_STATUS.LISTENING);
    showToast("Recording resumed.", "success");
  } catch (error) {
    shouldKeepListening = false;
    state.isRecordingPaused = true;
    updateStatus(APP_STATUS.ERROR);
    showToast(error.message, "error");
  }

  render();
}

function stopRecording() {
  shouldKeepListening = false;
  state.isListening = false;
  state.isRecordingPaused = false;
  recordingSessionActive = false;
  clearRecognitionRestartTimer();
  ignoreRecognitionError = true;
  recognition?.stop();

  if (activeCaptureStreamType) {
    const shouldDrainPendingChunks =
      speechModelReady && (meetingChunkQueue.length > 0 || activeMeetingTranscriptions > 0);
    stopStreamCaptureRecording({ drainPendingChunks: shouldDrainPendingChunks });

    if (shouldDrainPendingChunks) {
      updateStatus(APP_STATUS.TRANSCRIBING);
    }
  } else {
    releaseActiveMicrophone();
  }

  if (!drainingCaptureQueue) {
    updateStatus(state.isTranslating ? APP_STATUS.TRANSLATING : APP_STATUS.READY);
  }

  render();
}

function clearAll() {
  shouldKeepListening = false;
  state.isRecordingPaused = false;
  recordingSessionActive = false;
  ignoreRecognitionError = true;
  clearRecognitionRestartTimer();
  recognition?.abort?.();

  if (activeCaptureStreamType) {
    stopStreamCaptureRecording();
    resetCaptureProcessingState();
  } else {
    releaseActiveMicrophone();
  }

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
    const source = getLanguage(state.sourceLanguage);

    state.summary = await summarizeConversation({
      segments: fullTranscriptLines,
      language: state.sourceLanguage,
    });
    showToast(`${source.name} conversation summary created.`, "success");
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
  localStorage.setItem(CONFIG.selectedAudioInputStorageKey, elements.microphoneSelect.value);
  localStorage.setItem(CONFIG.selectedAudioSourceStorageKey, elements.audioSourceSelect.value);
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
  state.selectedAudioInputId = localStorage.getItem(CONFIG.selectedAudioInputStorageKey) || "";
  state.audioSource = localStorage.getItem(CONFIG.selectedAudioSourceStorageKey) || AUDIO_SOURCE.MICROPHONE;
  elements.audioSourceSelect.value = state.audioSource;

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
  elements.microphoneSelect.addEventListener("change", () => {
    state.selectedAudioInputId = elements.microphoneSelect.value;
    persistSettings();
    maybePreloadSpeechModel();
  });
  elements.audioSourceSelect.addEventListener("change", () => {
    state.audioSource = elements.audioSourceSelect.value;
    persistSettings();
    renderAudioSourceUi();
    render();
    maybePreloadSpeechModel();
  });
  renderAudioSourceUi();
  maybePreloadSpeechModel();
}

function applyPreferredAudioInputSelection() {
  const storedValue = localStorage.getItem(CONFIG.selectedAudioInputStorageKey);

  if (storedValue === "") {
    return false;
  }

  if (
    storedValue &&
    state.audioInputDevices.some((device) => device.deviceId === storedValue)
  ) {
    return false;
  }

  const preferredDevice = findPreferredAudioInputDevice(state.audioInputDevices);

  if (!preferredDevice) {
    return false;
  }

  state.selectedAudioInputId = preferredDevice.deviceId;
  return true;
}

function renderMicrophoneOptions() {
  const fragment = document.createDocumentFragment();
  const defaultOption = document.createElement("option");
  defaultOption.value = "";
  defaultOption.textContent = "System default";
  fragment.appendChild(defaultOption);

  state.audioInputDevices.forEach((device) => {
    const option = document.createElement("option");
    option.value = device.deviceId;
    const label = formatAudioInputLabel(device);

    if (/usb audio device/i.test(label)) {
      option.textContent = `${label} (Recommended)`;
    } else if (isMeetingLoopbackDevice(device)) {
      option.textContent = `${label} (Teams/Loopback)`;
    } else if (isUsbAudioDevice(device) && !/usb/i.test(label)) {
      option.textContent = `${label} (USB)`;
    } else {
      option.textContent = label;
    }

    fragment.appendChild(option);
  });

  elements.microphoneSelect.replaceChildren(fragment);

  if (applyPreferredAudioInputSelection()) {
    persistSettings();
  }

  elements.microphoneSelect.value = state.selectedAudioInputId;

  if (elements.microphoneSelect.value !== state.selectedAudioInputId) {
    state.selectedAudioInputId = "";
    persistSettings();
  }

  if (
    state.audioSource === AUDIO_SOURCE.MEETING &&
    getSelectedAudioInputDevice() &&
    isExternalAudioCaptureDevice(getSelectedAudioInputDevice())
  ) {
    state.audioSource = AUDIO_SOURCE.MICROPHONE;
    elements.audioSourceSelect.value = AUDIO_SOURCE.MICROPHONE;
    persistSettings();
  }

  renderAudioSourceUi();
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

async function initAudioInput() {
  if (!isAudioInputSupported()) {
    showToast("Microphone selection is not supported in this browser.", "error");
    render();
    return;
  }

  state.audioInputDevices = await loadAudioInputDevices();
  renderMicrophoneOptions();
  render();

  if (state.audioInputDevices.length === 0) {
    showToast("No microphones found. Plug in a USB mic and press Refresh.", "error");
  }
}

async function refreshMicrophones({ showResult = false } = {}) {
  if (!isAudioInputSupported()) {
    showToast("Microphone selection is not supported in this browser.", "error");
    render();
    return;
  }

  state.audioInputDevices = await loadAudioInputDevices();
  renderMicrophoneOptions();
  render();

  if (showResult) {
    const usbCount = state.audioInputDevices.filter(isUsbAudioDevice).length;
    const message =
      state.audioInputDevices.length > 0
        ? `Loaded ${state.audioInputDevices.length} microphone(s)${usbCount ? `, including ${usbCount} USB device(s).` : "."}`
        : "No microphones found. Check USB connection and browser permission.";
    showToast(message, state.audioInputDevices.length > 0 ? "success" : "error");
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

  populateLanguageSelector(elements.sourceLanguageSelect, state.sourceLanguage);
  populateLanguageSelector(elements.targetLanguageSelect, state.targetLanguage);
  elements.sourceLanguageSelect.addEventListener("change", changeSourceLanguage);
  elements.targetLanguageSelect.addEventListener("change", changeTargetLanguage);
  elements.swapLanguagesButton.addEventListener("click", swapLanguages);

  const micSupported = isSpeechRecognitionSupported();
  const meetingSupported = isMeetingAudioSupported();
  const usbSupported = isAudioInputSupported();
  elements.supportNotice.hidden = micSupported || meetingSupported || usbSupported;
  setDisabled(elements.recordButton, !micSupported && !meetingSupported && !usbSupported);

  elements.recordButton.addEventListener("click", startRecording);
  elements.pauseRecordingButton.addEventListener("click", pauseRecording);
  elements.resumeRecordingButton.addEventListener("click", resumeRecording);
  elements.stopButton.addEventListener("click", stopRecording);
  elements.speakButton.addEventListener("click", () => speakTranslation());
  elements.refreshVoicesButton.addEventListener("click", () => refreshVoices({ showResult: true }));
  elements.refreshMicrophonesButton.addEventListener("click", () => refreshMicrophones({ showResult: true }));
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
  initAudioInput();
  initTextToSpeech();

  if (isAudioInputSupported()) {
    navigator.mediaDevices.addEventListener("devicechange", () => {
      refreshMicrophones();
    });
  }
}

init();
