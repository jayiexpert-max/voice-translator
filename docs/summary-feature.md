# Conversation Summary Feature

Release: 3.1.0

## Goal

Create an English-only summary and export a complete Markdown review package for a second-pass AI review.

## Behavior

- Recording continues until the user presses Stop.
- Final recognition segments are retained in a full-session buffer.
- The rolling subtitle panels continue to show only recent lines.
- Generate Summary is available after recording stops and queued translations finish.
- The summary always uses complete English segments: original English speech or complete English translation.
- Export produces a UTF-8 `.md` file containing AI instructions, the preliminary English summary, the complete original transcript, and available translations.
- The on-screen Markdown is rendered as responsive overview, key-point, and action-item sections.
- Clear and Start Recording erase the previous full transcript, translations, and summary.

## Current Summary Engine

The browser uses a local English extractive summary so the feature works without a backend or an AI API key. The exported review package asks a second-pass AI to verify the complete transcript, correct omissions or mistranslations, and return a structured English answer.

The service boundary is `js/services/summaryService.js`. A future LLM implementation can replace this service with a backend request while preserving the UI and session-memory behavior.

## Security

Do not place an LLM API key in frontend JavaScript. A future AI provider must be called through a protected backend endpoint.

## Export Contract

The exported Markdown file is an AI review package rather than a claim of final accuracy. It contains YAML metadata, English-only output instructions, the local preliminary summary when available, the complete numbered original transcript, and all available translated segments. The reviewing AI is instructed to correct omissions, duplication, mistranslation, and unsupported conclusions.
