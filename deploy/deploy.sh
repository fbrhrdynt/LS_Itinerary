#!/usr/bin/env sh
set -eu

APP_DIR="/opt/ls_itinerary"
cd "$APP_DIR"

git pull --ff-only origin main
npm install --omit=dev
npm run check
npm test
sudo systemctl restart ls-itinerary
sleep 2
curl --fail --silent http://127.0.0.1:3015/health
printf '\nLS Itinerary updated successfully.\n'
