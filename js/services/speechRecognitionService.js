export function isSpeechRecognitionSupported() {
  return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
}

export function createSpeechRecognition({
  language,
  continuous = false,
  interimResults = false,
  onStart,
  onResult,
  onEnd,
  onError,
}) {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!Recognition) {
    throw new Error("Speech recognition is not supported in this browser.");
  }

  const recognition = new Recognition();
  recognition.lang = language;
  recognition.continuous = continuous;
  recognition.interimResults = interimResults;
  recognition.maxAlternatives = 1;

  recognition.onstart = () => onStart?.();

  recognition.onresult = (event) => {
    let finalTranscript = "";
    let interimTranscript = "";

    for (let index = 0; index < event.results.length; index += 1) {
      const result = event.results[index];
      const transcript = result[0]?.transcript ?? "";

      if (result.isFinal) {
        finalTranscript += `${transcript} `;
      } else {
        interimTranscript += `${transcript} `;
      }
    }

    onResult?.({
      finalTranscript: finalTranscript.trim(),
      interimTranscript: interimTranscript.trim(),
      isFinal: event.results[event.resultIndex]?.isFinal ?? false,
    });
  };

  recognition.onerror = (event) => {
    const detail = event.error ? ` (${event.error})` : "";
    const error = new Error(`Speech recognition failed${detail}.`);
    error.code = event.error;
    onError?.(error);
  };

  recognition.onend = () => onEnd?.();

  return recognition;
}
