#!/usr/bin/env bash
# Temporary https link to the local RideSync (for testing on phones).
# Install once: macOS `brew install cloudflared`, Linux see https://pkg.cloudflare.com
cd "$(dirname "$0")"
command -v cloudflared >/dev/null || { echo "Install cloudflared first (macOS: brew install cloudflared)"; exit 1; }
echo "Make sure RideSync is running (start.sh). Open the https://….trycloudflare.com link below on your phone."
exec cloudflared tunnel --no-autoupdate --protocol http2 --url http://localhost:5173
