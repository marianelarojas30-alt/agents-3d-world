#!/bin/bash
# Waits for the local server to respond and opens Agents World in the browser.
for i in $(seq 1 20); do
  if curl -s -o /dev/null http://127.0.0.1:8737/; then
    open http://127.0.0.1:8737
    exit 0
  fi
  sleep 1
done
