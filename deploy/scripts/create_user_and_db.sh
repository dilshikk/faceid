#!/usr/bin/env bash
# Creates the dedicated bcc Linux user, the bot_control_center database, and
# its own PostgreSQL role. Does not read or modify any other database.
set -euo pipefail

if ! id -u bcc >/dev/null 2>&1; then
  useradd --system --no-create-home --shell /usr/sbin/nologin bcc
  echo "Created system user: bcc"
fi

sudo -u postgres psql <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'bcc_user') THEN
    CREATE ROLE bcc_user LOGIN PASSWORD 'change_me';
  END IF;
END$$;

SELECT 'CREATE DATABASE bot_control_center OWNER bcc_user'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'bot_control_center')
\gexec
SQL

echo "Remember to change the bcc_user password and update DATABASE_URL in /etc/bot-control-center/bcc.env"
