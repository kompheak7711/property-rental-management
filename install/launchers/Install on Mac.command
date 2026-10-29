#!/bin/sh
# Installs or updates the CHETANA app on this Mac (install/mac/install.sh).
cd "$(dirname -- "$0")" || exit 1
PRM_HOME=$(pwd)
export PRM_HOME
sh app/install/mac/install.sh
status=$?
printf '\nYou can close this window.\n'
exit "$status"
