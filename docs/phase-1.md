# Phase 1 MVP

## Goal

English speech to Thai text in a browser. Recording continues until the user presses Stop.

## UI Wireframe

```text
AI Voice Translator                         [Ready]
English speech to Thai text

[Start Recording] [Stop]

Original English                 0 characters
Your recognized English text will appear here.

Thai Translation                 0 characters
คำแปลภาษาไทยจะแสดงที่นี่

[Copy Thai Text] [Clear]

Translation settings
LibreTranslate endpoint
API key, if your endpoint requires one
```

## File List

```text
index.html
css/base.css
css/theme.css
css/layout.css
css/components.css
css/responsive.css
js/app.js
js/config.js
js/constants.js
js/state.js
js/components/toast.js
js/services/speechRecognitionService.js
js/services/translationService.js
js/utils/clipboard.js
js/utils/dom.js
README.md
tests/manual-test-plan.md
```

## Development Checklist

- [x] Create scalable folder structure.
- [x] Build responsive dark glassmorphism UI.
- [x] Add record and stop controls.
- [x] Keep listening after Start until Stop is pressed.
- [x] Keep listening and reconnect when a temporary no-speech event ends recognition.
- [x] Detect Web Speech API support.
- [x] Configure English speech recognition with `en-US`.
- [x] Display recognized English text.
- [x] Append new recognized phrases like subtitle lines.
- [x] Remove older subtitle lines as new translations arrive.
- [x] Translate English to Thai.
- [x] Try provider fallback before reporting a translation failure.
- [x] Display translated Thai text.
- [ ] Show Thai transliteration when translation fails (deferred; current UI reports the error).
- [x] Add copy button.
- [x] Add clear button.
- [x] Add loading, ready, listening, and error states.
- [x] Add toast notifications.
- [x] Add configurable LibreTranslate endpoint and optional API key.
- [x] Add README and manual test plan.

## Testing Checklist

- [x] JavaScript syntax check passes.
- [x] Local static server returns `200`.
- [x] JavaScript module file is served.
- [x] Default translation endpoint responds to a test request.
- [ ] Manual microphone test in Chrome or Microsoft Edge.
- [ ] Manual continuous listening test until Stop.
- [ ] Manual subtitle-style new-line feed test.
- [ ] Manual rolling subtitle cleanup test.
- [ ] Manual no-speech reconnect test; listening must continue until Stop is pressed.
- [ ] Manual copy button clipboard test.
- [ ] Manual mobile viewport test.
- [x] Translation API failure reports an error instead of showing misleading transliteration.
- [ ] Bad primary provider still returns a usable Thai translation through fallback provider.

## Notes

The official `libretranslate.com` hosted endpoint requires an API key. The app defaults to a public mirror that worked during setup, but public mirrors can be rate-limited or unavailable. For production, place translation behind a serverless proxy.
