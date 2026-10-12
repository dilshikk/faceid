#!/usr/bin/env bash
# Installs the three BCC systemd units and reloads systemd.
# Run as root after the backend venv and frontend build already exist at
# /opt/bot-control-center/. Works from any directory.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UNITS_DIR="${SCRIPT_DIR}/../systemd"

for unit in bcc-api bcc-worker bcc-adminbot; do
  cp "${UNITS_DIR}/${unit}.service" "/etc/systemd/system/${unit}.service"
done

systemctl daemon-reload
systemctl enable bcc-api bcc-worker bcc-adminbot

echo "Units installed. Start with: systemctl start bcc-api bcc-worker bcc-adminbot"
echo "This script never touches mado-bot, invitebot, bkbot, or tgbot units."
