#!/bin/sh
# Makes the first Owner account, once (as scripts/local/bootstrap-owner.sh on the Mac). The
# installer runs it in its own window with "docker compose run --rm owner-setup"; the set-up
# shows the sign-in key and the recovery codes only in that window.
set -eu
. /opt/prm/common.sh
if [ "${1:-}" != "--inner" ]; then
  [ "$(id -u)" = 0 ] || prm_fail "bootstrap-owner.sh starts as root."
  [ -t 0 ] && [ -t 1 ] || prm_fail "Run it in a terminal window."
  for argument in "$@"; do
    case "$argument" in
      --database-url-fd*|--totp-key-fd*|--password-blocklist-fd*|--totp-key-identifier*|--ceremony-timeout-seconds*)
        prm_fail "$argument is set by this script." ;;
    esac
  done
  prm_with_key /bin/sh /opt/prm/bootstrap-owner.sh --inner "$@"
fi

shift
[ "${PRM_PROTECTED_KEY_FD:-}" = 4 ] || prm_fail "Start it without --inner."
cd /home/app
status=0
python3 -m property_rental.bootstrap_cli "$@" \
  --totp-key-identifier local-install-owner-bootstrap \
  --ceremony-timeout-seconds 900 \
  3< "$PRM_SECRETS/bootstrap_database_url" \
  5< "$PRM_BLOCKLIST" || status=$?
# The key and the recovery codes were shown in this window: clear it and its scrollback.
printf '\033[3J\033[2J\033[H' 2>/dev/null > /dev/tty || true
if [ "$status" -eq 0 ]; then
  printf 'The first Owner account is made.\n'
else
  printf 'The Owner set-up stopped and saved nothing.\n' >&2
  printf 'Check the password rule (15 to 128 characters, not a common password), the 6-digit\n' >&2
  printf 'code and the sentence. Delete the new CHETANA entry in Google Authenticator and throw\n' >&2
  printf 'away the recovery codes you wrote: they were not saved.\n' >&2
fi
exit "$status"
