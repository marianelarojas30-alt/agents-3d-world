#!/bin/bash
# Installs Agents World to start automatically on macOS login.
set -e
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PYTHON_BIN="$(command -v python3)"
if [ -z "$PYTHON_BIN" ]; then
  echo "Couldn't find python3 on PATH. Install it first (python.org) and run this again." >&2
  exit 1
fi

mkdir -p "$HOME/Library/LaunchAgents"

SERVER_LABEL="com.agentsworld.server"
SERVER_PLIST="$HOME/Library/LaunchAgents/$SERVER_LABEL.plist"
cat > "$SERVER_PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$SERVER_LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$PYTHON_BIN</string>
    <string>$PROJECT_DIR/server.py</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$PROJECT_DIR/server.log</string>
  <key>StandardErrorPath</key><string>$PROJECT_DIR/server.log</string>
</dict>
</plist>
EOF

OPEN_LABEL="com.agentsworld.open"
OPEN_PLIST="$HOME/Library/LaunchAgents/$OPEN_LABEL.plist"
cat > "$OPEN_PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$OPEN_LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$PROJECT_DIR/open-when-ready.sh</string>
  </array>
  <key>RunAtLoad</key><true/>
</dict>
</plist>
EOF

launchctl unload "$SERVER_PLIST" 2>/dev/null || true
launchctl unload "$OPEN_PLIST" 2>/dev/null || true
launchctl load "$SERVER_PLIST"
launchctl load "$OPEN_PLIST"

echo "Done — Agents World will start and open by itself every time you log in."
echo "To remove it:"
echo "  launchctl unload \"$SERVER_PLIST\" && rm \"$SERVER_PLIST\""
echo "  launchctl unload \"$OPEN_PLIST\" && rm \"$OPEN_PLIST\""
