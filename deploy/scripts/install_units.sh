#!/usr/bin/env bash
# Installs the three BCC systemd units and reloads systemd.
# Run as root after the backend venv and frontend build already exist at
# /opt/bot-control-center/.
set -euo pipefail

cp deploy/systemd/bcc-api.service /etc/systemd/system/bcc-api.service
cp deploy/systemd/bcc-worker.service /etc/systemd/system/bcc-worker.service
cp deploy/systemd/bcc-adminbot.service /etc/systemd/system/bcc-adminbot.service

systemctl daemon-reload
systemctl enable bcc-api bcc-worker bcc-adminbot

echo "Units installed. Start with: systemctl start bcc-api bcc-worker bcc-adminbot"
echo "This script never touches mado-bot, invitebot, bkbot, or tgbot units."
