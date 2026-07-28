# AI Voice Translator

Version 3.1 browser-based English and Thai voice translator.

**Version 3.1.0** · Design by **JayOverlay**

## Current Scope

Two-way English and Thai voice translation:

- Record microphone audio continuously through the Web Speech API until Stop is pressed.
- Recover automatically when browser speech recognition ends or reports a temporary network, aborted, or no-speech event.
- Display recognized source text continuously like subtitle lines.
- Remove older subtitle lines as new translations arrive.
- Translate English to Thai or Thai to English with provider fallback.
- Reject failed translations instead of displaying phonetic transliteration as if it were a translation.
- Speak translated target text through the SpeechSynthesis API.
- Let users enable automatic speech after each successful translation.
- Select a browser voice.
- Refresh Chrome browser voices when the voice list is empty.
- Pause, resume, and stop speech playback.
- Copy translated target text.
- Clear the current session.
- Generate a local English summary and export a complete `.md` package for a second-pass AI review.
- Show loading, status, and toast messages.

## Install on Windows (Desktop App)

Download the latest `.exe` installer from [GitHub Releases](https://github.com/jayiexpert-max/voice-translator/releases):

1. Open the Releases page.
2. Download `AI Voice Translator Setup *.exe` from the latest release.
3. Run the installer and follow the prompts.
4. Launch **AI Voice Translator** from the Start Menu or desktop shortcut.

> **Note:** The `.exe` appears only after a maintainer publishes a release (for example tag `v3.2.0`). If the Releases page is empty, see [docs/desktop-release.md](./docs/desktop-release.md).

The desktop app bundles the same web translator with microphone, USB audio, Teams/tab capture, translation, speech playback, summary, and Markdown export support.

### Build the Windows installer yourself

Requires Node.js 20+ on Windows (or use GitHub Actions):

```powershell
npm install
npm run desktop:build:win
```

The installer is written to `dist/`.

### Run the desktop app in development

```powershell
npm install
npm run desktop:dev
```

## Run Locally (Browser)

Use a local server instead of opening `index.html` directly. Speech recognition and microphone access work best on `localhost` or HTTPS.

### macOS Quick Start

Double-click `start.command`. It starts the local server and opens the app in your default browser. Keep the Terminal window open while using the app, then press `Ctrl+C` to stop the server.

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

Speech recognition support varies by browser. Chrome and Microsoft Edge are the recommended browsers for Phases 1-3. Thai recognition depends on the browser and operating system.

## Project Structure

```text
voice-translator/
|-- electron/
|   |-- main.js
|   `-- preload.js
|-- package.json
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
|   |   |-- summaryService.js
|   |   |-- textToSpeechService.js
|   |   |-- translationService.js
|   |   `-- transliterationService.js
|   `-- utils/
|       |-- clipboard.js
|       |-- download.js
|       `-- dom.js
|-- docs/
|   |-- phase-1.md
|   |-- phase-2.md
|   |-- summary-feature.md
|   `-- roadmap.md
|-- tests/
|   |-- manual-test-plan.md
|   `-- summaryService.test.mjs
`-- CHANGELOG.md
```

## Next Phase

Version 3.1 includes Phases 1-3 plus resilient continuous recognition, full-session transcript memory, responsive English summaries, and Markdown packages for second-pass AI review. Manual microphone and browser voice checks should still be performed on the target devices.

## Development Roadmap

See [docs/roadmap.md](./docs/roadmap.md) for the plan and checklist for every phase.

See [CHANGELOG.md](./CHANGELOG.md) for release history.

## License

Copyright (c) 2026 JayOverlay. This project is available under the [MIT License](./LICENSE).
