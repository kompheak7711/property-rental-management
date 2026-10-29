#!/bin/sh
# Opens the installed app: starts Docker Desktop and the app if needed, then the browser.
set -eu
. "$(dirname -- "$0")/common.sh"
prm_url >/dev/null
printf 'Starting CHETANA. Please wait...\n'
prm_docker_ready
prm_compose up -d --wait || prm_fail "The app did not start. Run the installer again."
prm_open_browser
