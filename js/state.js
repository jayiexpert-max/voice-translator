import { CONFIG } from "./config.js";

export const state = {
  isListening: false,
  isTranslating: false,
  isSpeaking: false,
  isSpeechPaused: false,
  autoSpeak: CONFIG.defaultAutoSpeak,
  selectedVoiceURI: "",
  voices: [],
  transcript: "",
  translation: "",
  sourceLanguage: CONFIG.defaultSourceLanguage,
  targetLanguage: CONFIG.defaultTargetLanguage,
  recognitionLanguage: CONFIG.recognitionLanguage,
};

export function resetState() {
  state.isListening = false;
  state.isTranslating = false;
  state.isSpeaking = false;
  state.isSpeechPaused = false;
  state.transcript = "";
  state.translation = "";
}
