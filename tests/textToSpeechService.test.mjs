import assert from "node:assert/strict";
import test from "node:test";

class MockUtterance {
  constructor(text) {
    this.text = text;
    this.lang = "";
    this.rate = 1;
    this.pitch = 1;
    this.voice = null;
    this.onstart = null;
    this.onend = null;
    this.onerror = null;
  }
}

const thaiVoice = {
  name: "Thai Voice",
  lang: "th-TH",
  voiceURI: "thai-voice",
};

let spokenUtterances;
let cancelCount;
let resumeCount;

globalThis.SpeechSynthesisUtterance = MockUtterance;
globalThis.window = {
  SpeechSynthesisUtterance: MockUtterance,
  setTimeout,
  clearTimeout,
  speechSynthesis: {
    speaking: false,
    paused: false,
    cancel() {
      cancelCount += 1;
    },
    resume() {
      resumeCount += 1;
    },
    getVoices() {
      return [thaiVoice];
    },
    speak(utterance) {
      spokenUtterances.push(utterance);
    },
  },
};

const { speakText, stopSpeech } = await import("../js/services/textToSpeechService.js");

test.beforeEach(() => {
  spokenUtterances = [];
  cancelCount = 0;
  resumeCount = 0;
  stopSpeech();
  cancelCount = 0;
});

test("speaks translated text with the selected Thai voice", async () => {
  let startedWith;
  let ended = false;

  const utterance = speakText({
    text: "สวัสดี",
    languageCode: "th-TH",
    voices: [thaiVoice],
    voiceURI: thaiVoice.voiceURI,
    onStart: (voice) => {
      startedWith = voice;
    },
    onEnd: () => {
      ended = true;
    },
  });

  assert.equal(cancelCount, 1);
  assert.deepEqual(spokenUtterances, []);
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.deepEqual(spokenUtterances, [utterance]);
  assert.equal(resumeCount, 1);
  assert.equal(utterance.lang, "th-TH");
  assert.equal(utterance.voice, thaiVoice);

  utterance.onstart();
  assert.equal(startedWith, thaiVoice);

  utterance.onend();
  assert.equal(ended, true);
});

test("replacing speech detaches callbacks from the cancelled utterance", async () => {
  const first = speakText({
    text: "ประโยคแรก",
    languageCode: "th-TH",
    voices: [thaiVoice],
  });
  const second = speakText({
    text: "ประโยคที่สอง",
    languageCode: "th-TH",
    voices: [thaiVoice],
  });

  assert.equal(first.onerror, null);
  assert.equal(first.onend, null);
  assert.equal(typeof second.onerror, "function");
  assert.equal(cancelCount, 2);
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.deepEqual(spokenUtterances, [second]);
  second.onstart();
  second.onend();
});
