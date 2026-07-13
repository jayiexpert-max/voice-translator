import { CONFIG } from "../config.js";

export async function translateText({
  text,
  sourceLanguage,
  targetLanguage,
  endpoint,
  apiKey,
}) {
  const normalizedText = text.trim();

  if (!normalizedText) {
    throw new Error("Please record speech before translating.");
  }

  const providerErrors = [];

  if (canUseMyMemory(sourceLanguage, targetLanguage)) {
    try {
      const translatedText = await translateWithMyMemory({
        text: normalizedText,
        sourceLanguage,
        targetLanguage,
      });

      assertUsableTranslation({
        translatedText,
        originalText: normalizedText,
        targetLanguage,
        provider: "MyMemory",
      });

      return translatedText;
    } catch (error) {
      providerErrors.push(error.message);
    }
  }

  try {
    const translatedText = await translateWithLibreTranslate({
      text: normalizedText,
      sourceLanguage,
      targetLanguage,
      endpoint,
      apiKey,
    });

    assertUsableTranslation({
      translatedText,
      originalText: normalizedText,
      targetLanguage,
      provider: "LibreTranslate",
    });

    return translatedText;
  } catch (error) {
    providerErrors.push(error.message);
  }

  throw new Error(providerErrors.join(" "));
}

async function translateWithLibreTranslate({
  text,
  sourceLanguage,
  targetLanguage,
  endpoint,
  apiKey,
}) {
  const payload = {
    q: text,
    source: sourceLanguage,
    target: targetLanguage,
    format: "text",
  };

  if (apiKey) {
    payload.api_key = apiKey;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = data.error || data.message || `Translation request failed with ${response.status}.`;
    throw new Error(message);
  }

  if (!data.translatedText) {
    throw new Error("Translation service returned an empty response.");
  }

  return data.translatedText;
}

async function translateWithMyMemory({ text, sourceLanguage, targetLanguage }) {
  const url = new URL(CONFIG.myMemoryEndpoint);
  url.searchParams.set("q", text);
  url.searchParams.set("langpair", `${sourceLanguage}|${targetLanguage}`);

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok || data.responseStatus >= 400) {
    const message = data.responseDetails || `MyMemory request failed with ${response.status}.`;
    throw new Error(message);
  }

  const translatedText = data.responseData?.translatedText;

  if (!translatedText) {
    throw new Error("MyMemory returned an empty response.");
  }

  return translatedText;
}

function canUseMyMemory(sourceLanguage, targetLanguage) {
  return sourceLanguage === "en" && targetLanguage === "th";
}

function assertUsableTranslation({ translatedText, originalText, targetLanguage, provider }) {
  const normalizedTranslation = translatedText.trim();

  if (!normalizedTranslation) {
    throw new Error(`${provider} returned an empty translation.`);
  }

  if (targetLanguage === "th" && !/[\u0E00-\u0E7F]/.test(normalizedTranslation)) {
    throw new Error(`${provider} returned non-Thai text.`);
  }

  if (looksLikeSameText(normalizedTranslation, originalText)) {
    throw new Error(`${provider} returned text that looks untranslated.`);
  }
}

function looksLikeSameText(translatedText, originalText) {
  const normalize = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const normalizedTranslation = normalize(translatedText);
  const normalizedOriginal = normalize(originalText);

  return Boolean(normalizedTranslation && normalizedTranslation === normalizedOriginal);
}
