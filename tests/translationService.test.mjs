import assert from "node:assert/strict";
import test from "node:test";

import { translateText } from "../js/services/translationService.js";

globalThis.window = {
  setTimeout,
  clearTimeout,
};

const request = {
  text: "Hello, my name is John",
  sourceLanguage: "en",
  targetLanguage: "th",
  endpoint: "https://libre.example/translate",
  apiKey: "",
};

function jsonResponse(data) {
  return {
    ok: true,
    status: 200,
    json: async () => data,
  };
}

test("uses the fast Google endpoint when it returns valid Thai", async () => {
  let fetchCount = 0;
  let requestSignal;
  globalThis.fetch = async (_url, options) => {
    fetchCount += 1;
    requestSignal = options.signal;
    return jsonResponse([[['สวัสดี ฉันชื่อจอห์น', "Hello, my name is John"]]]);
  };

  const result = await translateText(request);

  assert.equal(result, "สวัสดี ฉันชื่อจอห์น");
  assert.equal(fetchCount, 1);
  assert.equal(requestSignal instanceof AbortSignal, true);
});

test("removes MyMemory g tags while preserving their text", async () => {
  let fetchCount = 0;
  globalThis.fetch = async (url) => {
    fetchCount += 1;
    const requestedUrl = String(url);

    if (requestedUrl.includes("translate.googleapis.com")) {
      throw new Error("Google unavailable");
    }

    if (requestedUrl.includes("mymemory")) {
      return jsonResponse({
        responseStatus: 200,
        responseData: {
          translatedText: 'สวัสดี ฉันชื่อ <g id="1">John</g>',
        },
      });
    }

    return jsonResponse({ translatedText: "" });
  };

  const result = await translateText(request);

  assert.equal(result, "สวัสดี ฉันชื่อ John");
  assert.equal(fetchCount, 3);
});

test("rejects an empty MyMemory placeholder and uses LibreTranslate", async () => {
  const requestedUrls = [];
  globalThis.fetch = async (url) => {
    const requestedUrl = String(url);
    requestedUrls.push(requestedUrl);

    if (requestedUrl.includes("translate.googleapis.com")) {
      throw new Error("Google unavailable");
    }

    if (requestedUrl.includes("mymemory")) {
      return jsonResponse({
        responseStatus: 200,
        responseData: {
          translatedText: 'สวัสดี ฉันชื่อ <g id="1"> </g>',
        },
      });
    }

    return jsonResponse({ translatedText: "สวัสดี ฉันชื่อจอห์น" });
  };

  const result = await translateText(request);

  assert.equal(result, "สวัสดี ฉันชื่อจอห์น");
  assert.equal(requestedUrls.length, 3);
  assert.equal(requestedUrls.includes(request.endpoint), true);
});

test("uses LibreTranslate when Google fails and MyMemory times out", async () => {
  let fetchCount = 0;
  globalThis.fetch = async (url) => {
    fetchCount += 1;
    const requestedUrl = String(url);

    if (requestedUrl.includes("translate.googleapis.com")) {
      throw new Error("Google unavailable");
    }

    if (requestedUrl.includes("mymemory")) {
      const error = new Error("request aborted");
      error.name = "AbortError";
      throw error;
    }

    return jsonResponse({ translatedText: "สวัสดี ฉันชื่อจอห์น" });
  };

  const result = await translateText(request);

  assert.equal(result, "สวัสดี ฉันชื่อจอห์น");
  assert.equal(fetchCount, 3);
});
