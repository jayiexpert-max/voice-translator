# Changelog

All notable changes to AI Voice Translator are documented here.

## 3.1.0 - 2026-07-16

### Added

- Full-session transcript and translation memory separate from the rolling subtitle display.
- Responsive English-only conversation summaries with overview, key points, and action items.
- Markdown review-package export for second-pass AI verification.
- Summary service tests and summary feature documentation.

### Changed

- Speech recognition now reconnects after temporary `network`, `aborted`, and `no-speech` events.
- Listening continues until the user presses Stop or Clear.
- Translation request timeouts allow slower providers more time to respond.
- Clear and new recording actions erase all transcript and summary session memory.

## 3.0.0

- Added two-way English and Thai translation, language swapping, and target-language speech playback.
