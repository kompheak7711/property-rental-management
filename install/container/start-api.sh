#!/bin/sh
# Starts the API (as scripts/local/start-api.sh on the Mac): root opens the key, the API runs as
# user 10001 with the key on descriptor 4 and APP_ENVIRONMENT=production.
set -eu
. /opt/prm/common.sh
if [ "${1:-}" != "--inner" ]; then
  [ "$(id -u)" = 0 ] || prm_fail "start-api.sh starts as root."
  prm_origin >/dev/null
  prm_with_key /bin/sh /opt/prm/start-api.sh --inner
fi

[ "${PRM_PROTECTED_KEY_FD:-}" = 4 ] || prm_fail "Start it without --inner."
IFS= read -r APP_DATABASE_URL < "$PRM_SECRETS/runtime_database_url"
IFS= read -r APP_FINANCIAL_DATABASE_URL < "$PRM_SECRETS/financial_database_url"
APP_ENVIRONMENT=production
APP_TOTP_KEY_FILE=/dev/fd/4
APP_PASSWORD_BLOCKLIST_FILE=$PRM_BLOCKLIST
APP_ALLOWED_BROWSER_ORIGIN=$(prm_origin)
export APP_DATABASE_URL APP_FINANCIAL_DATABASE_URL APP_ENVIRONMENT APP_TOTP_KEY_FILE
export APP_PASSWORD_BLOCKLIST_FILE APP_ALLOWED_BROWSER_ORIGIN
printf 'API for %s.\n' "$APP_ALLOWED_BROWSER_ORIGIN"
cd /home/app
# The API has no published port: only the screen server (Caddy) and the installer's tools reach
# it, on the internal Docker network, so the forwarded device address is trusted from any peer
# there; Caddy replaces any X-Forwarded-For a device sends.
exec uvicorn property_rental.app:app --host 0.0.0.0 --port 8000 --no-access-log \
  --proxy-headers --forwarded-allow-ips '*'
