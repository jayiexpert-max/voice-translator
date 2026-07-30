#!/usr/bin/env bash
set -euo pipefail

REPO="jayiexpert-max/voice-translator"
TAG="${1:-v3.2.0}"
WORKFLOW_PATH=".github/workflows/release-desktop.yml"

echo "Checking for workflow on GitHub..."
status="$(curl -s -o /dev/null -w "%{http_code}" "https://api.github.com/repos/${REPO}/contents/${WORKFLOW_PATH}")"
if [[ "$status" != "200" ]]; then
  echo "Workflow not found on GitHub (HTTP ${status})."
  echo "Add ${WORKFLOW_PATH} on github.com first, then run this script again."
  exit 1
fi

echo "Workflow found. Fetching latest main..."
git fetch origin main

echo "Tagging origin/main as ${TAG}..."
git tag -f "$TAG" origin/main

echo "Pushing tag ${TAG}..."
git push origin "$TAG"

echo "Done. Watch the build at:"
echo "https://github.com/${REPO}/actions"
echo "Download the installer from:"
echo "https://github.com/${REPO}/releases/tag/${TAG}"
