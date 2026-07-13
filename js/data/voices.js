export const TARGET_TTS_LANGUAGE = "th-TH";

export function formatVoiceLabel(voice) {
  const localLabel = voice.localService ? "local" : "remote";
  return `${voice.name} (${voice.lang}, ${localLabel})`;
}

export function sortVoicesForLanguage(voices, languageCode) {
  const languagePrefix = languageCode.split("-")[0].toLowerCase();

  return [...voices].sort((a, b) => {
    const aMatches = a.lang.toLowerCase().startsWith(languagePrefix);
    const bMatches = b.lang.toLowerCase().startsWith(languagePrefix);

    if (aMatches !== bMatches) {
      return aMatches ? -1 : 1;
    }

    return a.name.localeCompare(b.name);
  });
}
