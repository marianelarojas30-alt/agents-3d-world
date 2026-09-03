#!/bin/bash
# Starts Agents World (local, no Claude needed) and opens it in the browser.
cd "$(dirname "$0")"
if lsof -i :8737 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Already running at http://127.0.0.1:8737"
else
  nohup python3 server.py > /tmp/agents3d-server.log 2>&1 &
  sleep 1
  echo "Started at http://127.0.0.1:8737"
fi
open http://127.0.0.1:8737
