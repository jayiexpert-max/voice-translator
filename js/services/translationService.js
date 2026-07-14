import { CONFIG } from "../config.js";

const PROVIDER_RATE_LIMIT_COOLDOWN_MS = 15 * 60 * 1000;

let myMemoryBlockedUntil = 0;

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

  try {
    const translatedText = await translateWithGoogle({
      text: normalizedText,
      sourceLanguage,
      targetLanguage,
    });

    assertUsableTranslation({
      translatedText,
      originalText: normalizedText,
      targetLanguage,
      provider: "Google Translate",
    });

    return translatedText;
  } catch (error) {
    providerErrors.push(error.message);
  }

  const providerRequests = [];

  if (canUseMyMemory(sourceLanguage, targetLanguage)) {
    providerRequests.push(
      translateWithMyMemory({
        text: normalizedText,
        sourceLanguage,
        targetLanguage,
      }).then((translatedText) => {
        const cleanedTranslation = cleanMyMemoryTranslation(translatedText);

        assertUsableTranslation({
          translatedText: cleanedTranslation,
          originalText: normalizedText,
          targetLanguage,
          provider: "MyMemory",
        });

        return cleanedTranslation;
      }),
    );
  }

  providerRequests.push(
    translateWithLibreTranslate({
      text: normalizedText,
      sourceLanguage,
      targetLanguage,
      endpoint,
      apiKey,
    }).then((translatedText) => {
      assertUsableTranslation({
        translatedText,
        originalText: normalizedText,
        targetLanguage,
        provider: "LibreTranslate",
      });

      return translatedText;
    }),
  );

  try {
    return await firstSuccessfulTranslation(providerRequests);
  } catch (error) {
    providerErrors.push(error.message);
    throw new Error(providerErrors.join(" "));
  }
}

async function translateWithGoogle({ text, sourceLanguage, targetLanguage }) {
  const url = new URL(CONFIG.googleTranslateEndpoint);
  url.searchParams.set("client", "gtx");
  url.searchParams.set("sl", sourceLanguage);
  url.searchParams.set("tl", targetLanguage);
  url.searchParams.set("dt", "t");
  url.searchParams.set("q", text);

  const response = await fetchWithTimeout(
    url.toString(),
    {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    },
    "Google Translate",
    CONFIG.fastTranslationRequestTimeoutMs,
  );
  const data = await response.json().catch(() => []);

  if (!response.ok) {
    throw new Error(`Google Translate request failed with ${response.status}.`);
  }

  const translatedText = Array.isArray(data[0])
    ? data[0].map((segment) => segment?.[0] || "").join("")
    : "";

  if (!translatedText) {
    throw new Error("Google Translate returned an empty response.");
  }

  return translatedText;
}

function firstSuccessfulTranslation(providerRequests) {
  return new Promise((resolve, reject) => {
    const providerErrors = [];
    let remainingRequests = providerRequests.length;

    providerRequests.forEach((request, index) => {
      request.then(resolve).catch((error) => {
        providerErrors[index] = error.message;
        remainingRequests -= 1;

        if (remainingRequests === 0) {
          reject(new Error(providerErrors.filter(Boolean).join(" ")));
        }
      });
    });
  });
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

  const response = await fetchWithTimeout(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  }, "LibreTranslate");

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

  const response = await fetchWithTimeout(url.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  }, "MyMemory");

  const data = await response.json().catch(() => ({}));

  if (!response.ok || data.responseStatus >= 400) {
    if (response.status === 429 || data.responseStatus === 429) {
      myMemoryBlockedUntil = Date.now() + PROVIDER_RATE_LIMIT_COOLDOWN_MS;
    }

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
  return (
    sourceLanguage === "en" &&
    targetLanguage === "th" &&
    Date.now() >= myMemoryBlockedUntil
  );
}

async function fetchWithTimeout(
  url,
  options,
  provider,
  timeoutMs = CONFIG.translationRequestTimeoutMs,
) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(`${provider} timed out after ${timeoutMs / 1000} seconds.`);
    }

    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

function cleanMyMemoryTranslation(translatedText) {
  if (/<g\b[^>]*>\s*<\/g>/i.test(translatedText)) {
    throw new Error("MyMemory returned an empty translation placeholder.");
  }

  return translatedText
    .replace(/<\/?g\b[^>]*>/gi, "")
    .trim();
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
