# Phase 2 Text-to-Speech

## Goal

Add Thai speech playback after English speech is translated to Thai text.

## Working Result

The app can:

- Record English speech.
- Keep listening until Stop is pressed.
- Show new recognized and translated phrases like subtitle lines.
- Remove older subtitle lines as new translations arrive.
- Translate the transcript to Thai.
- Try provider fallback before reporting a translation failure.
- Report a translation error if all providers fail instead of presenting transliteration as a translation.
- Speak the Thai translation aloud.
- Auto speak after translation when enabled.
- Let the user choose a browser voice.
- Let the user refresh browser voices when Chrome has not loaded them yet.
- Pause, resume, and stop playback.

## Added Files

```text
js/data/voices.js
js/services/textToSpeechService.js
```

## Updated Files

```text
index.html
css/base.css
css/layout.css
css/components.css
css/responsive.css
css/theme.css
js/app.js
js/config.js
js/constants.js
js/state.js
README.md
docs/roadmap.md
tests/manual-test-plan.md
```

## UI Wireframe

```text
Thai Speech Playback                  [ ] Auto Speak

Voice
[ Auto Thai voice                         v ]

[ Speak ] [ Pause ] [ Resume ] [ Stop ]
```

## Development Checklist

- [x] Create `textToSpeechService.js`.
- [x] Detect `speechSynthesis` support.
- [x] Load browser voices.
- [x] Handle async `voiceschanged`.
- [x] Select Thai voice automatically when available.
- [x] Add fallback to browser default voice.
- [x] Add voice selector.
- [x] Add voice refresh button for Chrome voice loading.
- [x] Add auto speak toggle.
- [x] Add Speak button.
- [x] Add Pause button.
- [x] Add Resume button.
- [x] Add Stop button.
- [x] Persist auto speak setting.
- [x] Persist selected voice setting.
- [x] Stop speech before starting a new recording.
- [x] Keep speech recognition running until Stop is pressed.
- [x] Append new recognized and translated phrases like subtitle lines.
- [x] Remove older subtitle lines as new translations arrive.
- [x] Keep listening and reconnect when a temporary no-speech event ends recognition.
- [x] Try provider fallback before reporting a translation failure.
- [ ] Keep Thai transliteration available when translation fails (deferred).
- [x] Stop speech when clearing the app.
- [x] Disable playback controls when unavailable.
- [x] Add Speaking and Paused statuses.

## Testing Checklist

- [x] JavaScript syntax check passes.
- [ ] Speak button reads Thai translation.
- [ ] Auto Speak reads Thai translation after a successful translation.
- [ ] Pause button pauses speech.
- [ ] Resume button resumes speech.
- [ ] Stop button stops speech.
- [ ] Clear button stops speech and clears text.
- [ ] Starting a new recording stops any active speech.
- [ ] Start keeps listening across multiple spoken phrases until Stop.
- [ ] New phrases appear as subtitle-style lines.
- [ ] Older subtitle lines are removed as new translations arrive.
- [ ] A no-speech event reconnects without stopping the listening session.
- [ ] Voice selector populates with browser voices.
- [ ] Refresh voices button repopulates voices in Chrome when available.
- [ ] App falls back gracefully when no Thai voice exists.
- [ ] App handles browsers without `speechSynthesis`.
- [x] Failed translation displays an error instead of an empty or misleading result.
- [ ] Bad primary provider still returns a usable Thai translation through fallback provider.

## Notes

Browser voices vary by device and operating system. Some machines may not include a Thai voice. In that case, the app uses the browser default voice and shows a toast.
