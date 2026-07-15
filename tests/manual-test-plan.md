# Phases 1-3 Manual Test Plan

## Setup

1. Start a local server:

   ```powershell
   python -m http.server 5173
   ```

2. Open `http://localhost:5173` in Chrome or Microsoft Edge.

## Functional Tests

| ID | Scenario | Steps | Expected Result |
|---|---|---|---|
| P1-01 | App loads | Open the local URL | App appears with Ready status |
| P1-02 | Browser support | Open in Chrome or Edge | Start Recording is enabled |
| P1-03 | Record speech | Click Start Recording and say "Hello, how are you?" | English transcript appears |
| P1-03B | Continuous listening | Click Start Recording, speak two separate phrases, then click Stop | App keeps listening and transcript accumulates until Stop |
| P1-03C | Subtitle feed | Click Start Recording and speak several short phrases with pauses | Each new phrase appears as a new subtitle-style line |
| P1-03D | Rolling subtitle cleanup | Speak more than three short phrases | Older subtitle lines are removed and only recent lines remain |
| P1-04 | Translate | Finish speaking | Thai translation appears |
| P1-05 | Copy | Click Copy Thai Text | Success toast appears and clipboard contains Thai text |
| P1-06 | Clear | Click Clear | Text panels reset and status returns to Ready |
| P1-07 | Stop | Click Start Recording, then Stop | Listening stops without a crash |
| P1-08 | Empty speech | Click Start Recording and stay silent | No speech toast appears and app keeps listening until Stop |
| P1-09 | Provider fallback | Set LibreTranslate endpoint to an invalid URL and record speech | Usable Thai translation still appears from fallback provider |
| P1-09B | Full translation failure | Block network or use dev tools to fail all translation requests | An error is shown and phonetic transliteration is not displayed as a translation |
| P1-09C | Slow provider | Throttle or stall translation requests, then play continuous English speech | Each provider times out, requests do not pile up, and the latest phrase continues through fallback |
| P1-09D | Preserve visible translation | Throttle the next translation after Thai text is already visible | The previous Thai translation remains readable until a newer successful translation replaces it |
| P1-09E | Rolling Thai subtitle feed | Speak several short English sentences with pauses | Final Thai lines flow downward, the current interim line updates at the bottom, and only the oldest line is removed after the feed exceeds three lines |
| P1-10 | Keyboard use | Tab through all controls | Visible focus appears and controls work |
| P2-01 | Speak translation | Complete a translation, then click Speak | Thai translation is spoken aloud |
| P2-02 | Auto speak toggle | Enable Auto Speak, then complete a translation | The target translation is spoken automatically |
| P2-03 | Pause playback | Click Speak, then Pause | Speech pauses |
| P2-04 | Resume playback | Pause speech, then click Resume | Speech continues |
| P2-05 | Stop playback | Click Speak, then Stop | Speech stops |
| P2-06 | Voice selection | Select a voice, then click Speak | Selected voice is used when available |
| P2-06B | Refresh voices | Open Chrome, click Refresh in playback controls | Browser voices appear when Chrome exposes them |
| P2-07 | Clear during speech | Click Speak, then Clear | Speech stops and panels reset |
| P2-08 | Record during speech | Click Speak, then Start Recording | Speech stops before recording begins |
| P2-09 | No Thai voice | Test on a device without Thai voice | App falls back without crashing |
| P3-01 | Language selectors | Choose English and Thai in either direction | Panel labels and direction text update |
| P3-02 | Thai to English | Select Thai as source, speak Thai, then stop | English translation appears |
| P3-03 | Swap languages | Click Swap languages | Source and target switch and current text is cleared |
| P3-04 | Different languages only | Try selecting the same language in both selectors | The other selector changes to keep the pair valid |
| P3-05 | Target copy | Translate in either direction, then click Copy Target Text | Target translation is copied |
| P3-06 | Target speech | Translate in either direction, then click Speak | Speech uses the selected target language |

## Responsive Tests

| Viewport | Expected Result |
|---|---|
| Desktop 1440px | Two text panels appear side by side |
| Tablet 768px | Layout remains readable |
| Mobile 390px | Panels stack vertically and buttons fit |

## Accessibility Checks

- Buttons are reachable by keyboard.
- Status changes are announced through live regions.
- Text contrast is readable on dark background.
- Focus indicators are visible.
- Motion is minimal and respects reduced-motion preferences.

## Known Limits

- Web Speech API support depends on browser and OS.
- SpeechSynthesis voice availability depends on browser and OS.
- Hosted LibreTranslate endpoints can rate-limit or require an API key.
- Speech recognition accuracy depends on microphone quality and background noise.
