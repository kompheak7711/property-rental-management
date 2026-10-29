#!/bin/sh
# Stops the installed app. The data stays; the CHETANA icon starts it again.
set -eu
. "$(dirname -- "$0")/common.sh"
prm_docker_ready
prm_compose stop
printf 'CHETANA is stopped. Double-click CHETANA on the Desktop to start it again.\n'
