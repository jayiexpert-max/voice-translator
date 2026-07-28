import { CONFIG } from "../config.js";

const WHISPER_LANGUAGE = {
  en: "english",
  th: "thai",
};

const HALLUCINATION_PATTERNS = [
  /^thank you for watching\.?$/i,
  /^thanks for watching\.?$/i,
  /^please subscribe\.?$/i,
  /^subscribe to (the )?channel\.?$/i,
  /^subtitles by/i,
  /^subtitle/i,
  /^amara\.org/i,
  /^copyright/i,
  /^you$/i,
  /^\.+$/,
];

let transcriberPromise = null;
let loadedModelKey = "";

function getWhisperModel(sourceLanguage, useFallback = false) {
  if (useFallback) {
    return sourceLanguage === "en"
      ? CONFIG.meetingWhisperModelFallbackEn
      : CONFIG.meetingWhisperModelFallbackMultilingual;
  }

  return sourceLanguage === "en" ? CONFIG.meetingWhisperModelEn : CONFIG.meetingWhisperModelMultilingual;
}

function resetTranscriberIfNeeded(modelId) {
  if (loadedModelKey && loadedModelKey !== modelId) {
    transcriberPromise = null;
  }

  loadedModelKey = modelId;
}

async function createTranscriber(modelId) {
  const { pipeline } = await import("https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2");
  return pipeline("automatic-speech-recognition", modelId);
}

async function loadTranscriber(sourceLanguage) {
  const primaryModelId = getWhisperModel(sourceLanguage);
  resetTranscriberIfNeeded(primaryModelId);

  if (!transcriberPromise) {
    transcriberPromise = (async () => {
      try {
        return await createTranscriber(primaryModelId);
      } catch (primaryError) {
        const fallbackModelId = getWhisperModel(sourceLanguage, true);
        resetTranscriberIfNeeded(fallbackModelId);
        return createTranscriber(fallbackModelId);
      }
    })();
  }

  return transcriberPromise;
}

export async function preloadMeetingTranscriber(sourceLanguage) {
  const timeoutMs = CONFIG.meetingSpeechModelTimeoutMs;

  return Promise.race([
    loadTranscriber(sourceLanguage),
    new Promise((_, reject) => {
      window.setTimeout(() => {
        reject(new Error("Speech model download timed out. Check your internet connection and try again."));
      }, timeoutMs);
    }),
  ]);
}

export function isLikelyHallucination(text) {
  const normalized = text.trim();

  if (!normalized || normalized.length < 2) {
    return true;
  }

  return HALLUCINATION_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function isPlausibleTranscript(text, sourceLanguage) {
  const normalized = text.trim();

  if (!normalized || normalized.length < 2 || isLikelyHallucination(normalized)) {
    return false;
  }

  if (sourceLanguage === "th") {
    const thaiChars = (normalized.match(/[\u0E00-\u0E7F]/g) || []).length;
    return thaiChars > 0 || normalized.length >= 4;
  }

  if (sourceLanguage === "en") {
    const latinChars = (normalized.match(/[a-zA-Z]/g) || []).length;
    return latinChars >= 2;
  }

  return true;
}

export async function transcribeMeetingAudio(blob, sourceLanguage) {
  const transcriber = await loadTranscriber(sourceLanguage);
  const url = URL.createObjectURL(blob);

  try {
    const result = await transcriber(url, {
      language: WHISPER_LANGUAGE[sourceLanguage] || "english",
      task: "transcribe",
      temperature: 0,
      chunk_length_s: 30,
      stride_length_s: 5,
    });

    return (result?.text || "").trim().replace(/\s+/g, " ");
  } finally {
    URL.revokeObjectURL(url);
  }
}
