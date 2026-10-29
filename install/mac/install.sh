#!/bin/sh
# Installs (or updates) the V1 app on this Mac, inside Docker Desktop. Double-click
# "Install on Mac.command", or run: sh install/mac/install.sh
#
# It is safe to run again: the data, the passwords, the sign-in key and the Owner account are
# kept; only new program files and new database changes are added.
set -eu
. "$(dirname -- "$0")/common.sh"
cd "$PRM_APP"

printf '\n=== CHETANA Residence Management: install on this Mac ===\n\n'
printf 'Step 1 of 7: checking Docker Desktop...\n'
prm_docker_ready

printf 'Step 2 of 7: reading this Mac'"'"'s network name...\n'
name=$(scutil --get LocalHostName 2>/dev/null || hostname -s)
name=$(printf '%s' "$name" | tr '[:upper:]' '[:lower:]')
case "$name" in
  ''|-*|*-|*[!a-z0-9-]*)
    prm_fail "This Mac's local name '$name' can only use letters, digits and hyphens. Change it in System Settings, General, Sharing, Local hostname, then run this again." ;;
esac
umask 022
printf '# Written by the installer. The app address is https://%s.local:%s\nPRM_HOST=%s.local\n' \
  "$name" "$PRM_PORT" "$name" > "$PRM_INSTALL/.env"
url=$(prm_url)
printf '   The app address will be %s\n' "$url"

printf 'Step 3 of 7: building the app. The first time this takes 5 to 15 minutes...\n'
prm_compose build || prm_fail "The build failed. Check the internet connection, then run this again."

printf 'Step 4 of 7: starting the database, the database changes and the app...\n'
prm_compose up -d --wait || prm_fail "The app did not start. Run this again; if it stops here again, send the last lines of this window."

printf 'Step 5 of 7: checking the first Owner account...\n'
status=0
prm_compose run --rm -T tool owner-made >/dev/null 2>&1 || status=$?
if [ "$status" -eq 3 ]; then
  printf '\n   Now you make the first Owner account (only once).\n'
  printf '   Have your phone ready with Google Authenticator, and paper and a pen.\n'
  printf '   User name: owner\n'
  printf '   1. Type a password two times (15 to 128 characters). Nothing shows while you type.\n'
  printf '   2. In Google Authenticator: +, "Enter a setup key", type the key shown here.\n'
  printf '   3. Type the 6-digit code from the phone.\n'
  printf '   4. Write the 10 recovery codes on paper.\n'
  printf '   5. Type: I HAVE STORED THE RECOVERY CODES\n\n'
  printf '   Press Return when you are ready. '
  read -r _ready
  prm_compose run --rm owner-setup --username owner --display-name "CHETANA Owner" \
    --audit-name chetana-owner || prm_fail "The Owner account was not made. Run this again to try again."
elif [ "$status" -ne 0 ]; then
  prm_fail "The Owner account check did not work. Run this again."
else
  printf '   The Owner account is already there.\n'
fi

printf 'Step 6 of 7: setting up the Property...\n'
property_file="$PRM_INSTALL/.property-name"
if [ -s "$property_file" ]; then
  IFS= read -r property < "$property_file"
else
  printf '   Type the business name and press Return (just Return for "CHETANA Residence"): '
  IFS= read -r property || property=
  [ -n "$property" ] || property="CHETANA Residence"
fi
prm_compose run --rm -T tool setup-property "$property" || prm_fail "The Property was not set up. Run this again."
printf '%s\n' "$property" > "$property_file"

printf 'Step 7 of 7: the security certificate and the desktop icon...\n'
certificate="$PRM_HOME/CHETANA certificate.crt"
tries=0
until prm_compose cp web:/data/caddy/pki/authorities/local/root.crt "$certificate" >/dev/null 2>&1; do
  tries=$((tries + 1))
  [ "$tries" -le 30 ] || prm_fail "The certificate was not made. Run this again."
  sleep 2
done
if security verify-cert -c "$certificate" >/dev/null 2>&1; then
  printf '   This Mac already trusts the app certificate.\n'
else
  printf '   Type your Mac password if asked, so this Mac trusts the app (once).\n'
  sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain "$certificate" ||
    prm_fail "The certificate was not trusted. Run this again."
fi

shortcut="$HOME/Desktop/CHETANA.command"
quoted=$(printf '%s' "$PRM_INSTALL/mac/open.sh" | sed "s/'/'\\\\''/g")
printf '#!/bin/sh\n# Opens the CHETANA app (made by the installer).\nexec sh '"'"'%s'"'"'\n' "$quoted" > "$shortcut"
chmod 0755 "$shortcut"

printf '\nDONE. The app is installed.\n'
printf '  - Open it: double-click CHETANA on the Desktop, or go to %s\n' "$url"
printf '  - User name: owner. Use Safari or Chrome.\n'
printf '  - iPad on the same Wi-Fi: open %s/chetana-certificate.crt once to install the certificate\n' "$url"
printf '    (see READ ME FIRST.txt), then open %s\n' "$url"
printf '  - Keep Docker Desktop set to start when you log in (Docker Desktop, Settings, General).\n\n'
prm_open_browser
