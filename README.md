# AI Voice Translator

Phase 2 MVP for a browser-based voice translator.

**Version 2.0.0** · Design by **JayOverlay**

## Current Scope

English speech to Thai text:

- Record microphone audio continuously through the Web Speech API until Stop is pressed.
- Display recognized English text continuously like subtitle lines.
- Remove older subtitle lines as new translations arrive.
- Translate English to Thai with provider fallback.
- Reject failed translations instead of displaying phonetic transliteration as if it were a translation.
- Speak translated Thai text through the SpeechSynthesis API.
- Keep automatic speech paused while live translation performance is prioritized.
- Select a browser voice.
- Refresh Chrome browser voices when the voice list is empty.
- Pause, resume, and stop speech playback.
- Copy translated Thai text.
- Clear the current session.
- Show loading, status, and toast messages.

## Run Locally

Use a local server instead of opening `index.html` directly. Speech recognition and microphone access work best on `localhost` or HTTPS.

```powershell
python -m http.server 5173
```

Then open:

```text
http://localhost:5173
```

## Translation Settings

The app defaults to a public LibreTranslate mirror that does not require an API key:

```text
https://translate.fedilab.app/translate
```

The official hosted endpoint, `https://libretranslate.com/translate`, currently requires an API key. Some mirrors can also be rate-limited or unavailable. Open **Translation settings** in the app to change the endpoint or enter an API key.

For English-to-Thai mode, the live path first uses the fast Google Translate web endpoint. If it fails, the app requests MyMemory and the configured LibreTranslate-compatible endpoint in parallel and uses the first usable translation. If every provider fails or returns unusable text, the app reports the failure instead of presenting phonetic transliteration as a translation.

For production, use a serverless proxy on Netlify, Vercel, or Cloudflare Pages to protect API keys and normalize provider errors.

## Browser Support

Speech recognition support varies by browser. Chrome and Microsoft Edge are the recommended browsers for Phase 1 and Phase 2.

## Project Structure

```text
voice-translator/
|-- index.html
|-- css/
|   |-- base.css
|   |-- theme.css
|   |-- layout.css
|   |-- components.css
|   `-- responsive.css
|-- js/
|   |-- app.js
|   |-- config.js
|   |-- constants.js
|   |-- state.js
|   |-- components/
|   |   `-- toast.js
|   |-- data/
|   |   `-- voices.js
|   |-- services/
|   |   |-- speechRecognitionService.js
|   |   |-- textToSpeechService.js
|   |   |-- translationService.js
|   |   `-- transliterationService.js
|   `-- utils/
|       |-- clipboard.js
|       `-- dom.js
|-- docs/
|   |-- phase-1.md
|   |-- phase-2.md
|   `-- roadmap.md
`-- tests/
    `-- manual-test-plan.md
```

## Next Phase

Phase 3 should add Thai to English translation, language selectors, and a swap language button.

## Development Roadmap

See [docs/roadmap.md](./docs/roadmap.md) for the plan and checklist for every phase.

## License

Copyright (c) 2026 JayOverlay. This project is available under the [MIT License](./LICENSE).
