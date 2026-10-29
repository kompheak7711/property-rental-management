#!/bin/sh
# Shared lines of the installed app's container scripts (install/compose.yaml). Paths only.
PRM_SECRETS=/run/prm-secrets
PRM_KEY_FILE=/run/prm-key/totp_protection_key
PRM_HELPER=/opt/prm/with-protected-key.py
PRM_BLOCKLIST=/opt/prm/password-blocklist.txt

prm_fail() {
  printf '%s\n' "$*" >&2
  exit 1
}

# The one address of the screens, from PRM_HOST (the installer sets it, for example
# "office-pc.local"); refused unless it is letters, digits and hyphens, then ".local".
prm_origin() {
  host=${PRM_HOST:-}
  name=${host%.local}
  case "$name" in
    ''|-*|*-|*[!a-z0-9-]*) prm_fail "PRM_HOST '$host' is not usable; run the installer again." ;;
  esac
  [ "$host" = "$name.local" ] || prm_fail "PRM_HOST '$host' must end with .local; run the installer again."
  printf 'https://%s:8443\n' "$host"
}

# Runs one command as user 10001 with the root-only key on descriptor 4 (the helper checks the
# key file and folder, closes every other descriptor and drops root for good).
prm_with_key() {
  SUDO_UID=10001 SUDO_GID=10001 exec python3 -I "$PRM_HELPER" --key "$PRM_KEY_FILE" --fd 4 -- "$@"
}
