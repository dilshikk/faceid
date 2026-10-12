#!/usr/bin/env bash
# Stage 1 audit script (TZ section 10, stage 1). Read-only: lists existing
# systemd units, PM2 processes, Nginx sites and PostgreSQL databases so you
# can confirm nothing here will be touched before BCC is installed.
set -euo pipefail

echo "== systemd units matching known bots =="
systemctl list-units --all 'mado-bot*' 'invitebot*' 'bkbot*' 'tgbot*' 2>/dev/null || true

echo
echo "== PM2 processes (if pm2 is installed) =="
command -v pm2 >/dev/null 2>&1 && pm2 list || echo "pm2 not found"

echo
echo "== Nginx enabled sites =="
ls -1 /etc/nginx/sites-enabled 2>/dev/null || echo "no nginx sites-enabled directory"

echo
echo "== PostgreSQL databases =="
command -v psql >/dev/null 2>&1 && sudo -u postgres psql -l || echo "psql not found"

echo
echo "== Disk space =="
df -h /
