#!/bin/sh
# Stops the CHETANA app; the data stays.
cd "$(dirname -- "$0")" || exit 1
PRM_HOME=$(pwd)
export PRM_HOME
sh app/install/mac/stop.sh
status=$?
printf '\nYou can close this window.\n'
exit "$status"
