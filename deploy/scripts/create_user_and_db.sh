#!/usr/bin/env bash
# Creates the dedicated bcc Linux user, the bot_control_center database, and
# its own PostgreSQL role. Does not read or modify any other database.
#
# The database password is taken from BCC_DB_PASSWORD, or generated randomly
# if the variable is not set. It is printed once at the end - put it into
# DATABASE_URL in /etc/bot-control-center/bcc.env.
set -euo pipefail

if ! id -u bcc >/dev/null 2>&1; then
  useradd --system --no-create-home --shell /usr/sbin/nologin bcc
  echo "Created system user: bcc"
fi

# Let the service user read other services' journal entries.
usermod -aG systemd-journal bcc

DB_PASSWORD="${BCC_DB_PASSWORD:-$(openssl rand -hex 24)}"

sudo -u postgres psql -v ON_ERROR_STOP=1 -v db_password="${DB_PASSWORD}" <<'SQL'
SELECT format('CREATE ROLE bcc_user LOGIN PASSWORD %L', :'db_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'bcc_user')
\gexec

SELECT 'CREATE DATABASE bot_control_center OWNER bcc_user'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'bot_control_center')
\gexec
SQL

echo
echo "Database role: bcc_user (password applies only if the role was just created)"
echo "Password: ${DB_PASSWORD}"
echo "Set DATABASE_URL in /etc/bot-control-center/bcc.env accordingly."
echo "Then create the first user:  .venv/bin/python -m app.cli.create_user <name> --role owner"
