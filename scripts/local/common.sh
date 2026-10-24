#!/bin/sh
# Shared settings of the local run on the Mac mini (login sub-slice L7c, owner answers (a) to
# Q-2026-10-21-155 and Q-2026-10-21-159; technical points Q-2026-10-24-189). Sourced by the
# other scripts in this folder. It holds paths and names only, never a password or a key.

# The repository root, from this file's place.
PRM_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
PRM_LOCAL="$PRM_ROOT/.local"
PRM_SECRETS="$PRM_LOCAL/secrets"
PRM_HTTPS="$PRM_LOCAL/https"
PRM_KEY_FILE="${PRM_KEY_FILE:-/usr/local/etc/prm/totp_protection_key}"
PRM_HELPER="${PRM_HELPER:-/usr/local/libexec/prm/with-protected-key.py}"
PRM_BLOCKLIST="$PRM_ROOT/config/password-blocklist.txt"
PRM_POSTGRES_PORT="${POSTGRES_PORT:-5432}"

# The Mac mini's local network name (for example "office-mac"), so the iPad on the same Wi-Fi
# can open https://office-mac.local:5173. PRM_LOCAL_HOSTNAME may name it instead.
prm_local_hostname() {
  if [ -n "${PRM_LOCAL_HOSTNAME:-}" ]; then
    printf '%s\n' "$PRM_LOCAL_HOSTNAME"
  elif command -v scutil >/dev/null 2>&1; then
    scutil --get LocalHostName
  else
    hostname -s
  fi
}

prm_origin() {
  printf 'https://%s.local:5173\n' "$(prm_local_hostname)"
}

prm_fail() {
  printf '%s\n' "$*" >&2
  exit 1
}

# The eight database password files the compose service reads (README, PostgreSQL and
# migrations).
PRM_PASSWORD_NAMES="admin migration runtime financial backup restore human_admin bootstrap"

prm_export_password_files() {
  for name in $PRM_PASSWORD_NAMES; do
    file="$PRM_SECRETS/postgres_${name}_password"
    [ -s "$file" ] || prm_fail "Missing $file. Run: sh scripts/local/make-secrets.sh"
    variable=$(printf 'POSTGRES_%s_PASSWORD_FILE' "$name" | tr '[:lower:]' '[:upper:]')
    export "$variable=$file"
  done
}
