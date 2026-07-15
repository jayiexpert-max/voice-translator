#!/bin/zsh

set -e

cd "$(dirname "$0")"

PORT="${PORT:-5173}"
URL="http://localhost:${PORT}"

if ! command -v python3 >/dev/null 2>&1; then
  echo "Python 3 is required to start the project."
  echo "Install it from https://www.python.org/downloads/"
  read -r "?Press Enter to close..."
  exit 1
fi

if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "A server is already running at $URL"
  open "$URL"
  read -r "?Press Enter to close..."
  exit 0
fi

echo "Starting AI Voice Translator at $URL"
python3 -m http.server "$PORT" >/tmp/voice-translator-http.log 2>&1 &
SERVER_PID=$!

cleanup() {
  kill "$SERVER_PID" 2>/dev/null || true
}

trap cleanup EXIT INT TERM

sleep 1
open "$URL"
echo "The app is open in your browser. Keep this window open while using it."
echo "Press Ctrl+C to stop the local server."
wait "$SERVER_PID"
