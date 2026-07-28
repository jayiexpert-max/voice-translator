# Desktop Release Guide

The Windows `.exe` installer is **not in the source code**. It is built by GitHub Actions and published to GitHub Releases when a maintainer pushes a version tag.

## Why users see no download yet

1. The Electron wrapper commit must be on GitHub (`main`).
2. A maintainer must push a tag such as `v3.2.0`.
3. GitHub Actions builds the installer on Windows and uploads it to Releases.

Until those steps complete, the Releases page will have **no `.exe` file**.

## Publish a Windows installer (maintainer)

Run these commands from the repo root:

```bash
git push origin main
git tag v3.2.0
git push origin v3.2.0
```

If push fails with `without workflow scope`, update your GitHub token or push with GitHub Desktop / SSH, then retry.

After the tag push:

1. Open [GitHub Actions](https://github.com/jayiexpert-max/voice-translator/actions)
2. Wait for **Release Desktop** to finish
3. Open [GitHub Releases](https://github.com/jayiexpert-max/voice-translator/releases)
4. Confirm `AI Voice Translator Setup 3.2.0.exe` is attached

## Manual workflow trigger

If the workflow file is already on GitHub, you can also:

1. Go to **Actions** → **Release Desktop**
2. Click **Run workflow**
3. Download the artifact from the completed run (for testing before a public release)

## User install steps

Once a release exists:

1. Go to [GitHub Releases](https://github.com/jayiexpert-max/voice-translator/releases)
2. Download the latest `AI Voice Translator Setup *.exe`
3. Run the installer
4. Launch **AI Voice Translator** from the Start Menu
