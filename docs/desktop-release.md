# Desktop Release Guide

Use the web app at **https://voice-translator-sage.vercel.app/** — no download required.

The Windows `.exe` installer is optional. It is **not in the source code**. GitHub Actions builds it and publishes to GitHub Releases when a maintainer pushes a version tag.

## Why users see no `.exe` download yet

1. The Electron wrapper is on GitHub (`main`). **Done.**
2. Version labels now show **3.2.0** in the app, README, and CHANGELOG. **Done.**
3. Add the GitHub Actions workflow file on github.com (see below). **Required for `.exe` builds.**
4. Push tag `v3.2.0` after the workflow exists.
5. GitHub Actions builds the installer and uploads it to Releases.

Until steps 3–5 complete, the Releases page will have **no `.exe` file**.

## Add the build workflow on GitHub (one-time)

Local `git push` may fail if your token lacks the `workflow` scope. Add the workflow in the browser instead:

1. Open https://github.com/jayiexpert-max/voice-translator
2. Click **Add file** → **Create new file**
3. Path: `.github/workflows/release-desktop.yml`
4. Paste the contents from the local file `.github/workflows/release-desktop.yml` in this repo
5. Click **Commit directly to the main branch**

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
