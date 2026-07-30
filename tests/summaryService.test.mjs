import assert from "node:assert/strict";
import test from "node:test";

const { buildAiSummaryPackage, summarizeConversation } = await import("../js/services/summaryService.js");

test("creates an English Markdown summary and detects action items", async () => {
  const summary = await summarizeConversation({
    segments: ["We reviewed the launch plan.", "We need to update the release notes."],
    language: "en",
    generatedAt: new Date("2026-07-16T10:00:00.000Z"),
  });

  assert.match(summary, /^# Conversation Summary/m);
  assert.match(summary, /## Key Points/);
  assert.match(summary, /- We need to update the release notes\./);
});

test("creates a Thai Markdown summary from Thai input", async () => {
  const summary = await summarizeConversation({
    segments: ["เราตรวจสอบแผนการเปิดตัว", "ต้องอัปเดตบันทึกประจำ release"],
    language: "th",
  });

  assert.match(summary, /^# สรุปการสนทนา/m);
  assert.match(summary, /## ประเด็นสำคัญ/);
  assert.match(summary, /- ต้องอัปเดตบันทึกประจำ release/);
});

test("rejects an empty conversation", async () => {
  await assert.rejects(() => summarizeConversation({ segments: ["   "] }), /no conversation/i);
});

test("builds an AI review package with complete transcript context", () => {
  const reviewPackage = buildAiSummaryPackage({
    preliminarySummary: "# Conversation Summary\n\n## Overview\n\nLaunch reviewed.",
    sourceSegments: ["We reviewed launch.", "We approved release."],
    translatedSegments: ["เราตรวจสอบการเปิดตัว"],
    sourceLanguage: "English",
    targetLanguage: "Thai",
    generatedAt: new Date("2026-07-16T10:00:00.000Z"),
  });

  assert.match(reviewPackage, /required_output_language: English/);
  assert.match(reviewPackage, /Produce the final answer in English only\./);
  assert.match(reviewPackage, /1\. We reviewed launch\./);
  assert.match(reviewPackage, /2\. We approved release\./);
});

test("builds an AI review package using the source language for output instructions", () => {
  const reviewPackage = buildAiSummaryPackage({
    preliminarySummary: "# สรุปการสนทนา",
    sourceSegments: ["เราตรวจสอบการเปิดตัว"],
    translatedSegments: ["We reviewed the launch."],
    sourceLanguage: "Thai",
    targetLanguage: "English",
  });

  assert.match(reviewPackage, /required_output_language: Thai/);
  assert.match(reviewPackage, /Produce the final answer in Thai only\./);
});
