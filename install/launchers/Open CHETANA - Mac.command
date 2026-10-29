#!/bin/sh
# Opens the CHETANA app (the same as the CHETANA icon on the Desktop).
cd "$(dirname -- "$0")" || exit 1
PRM_HOME=$(pwd)
export PRM_HOME
sh app/install/mac/open.sh
status=$?
printf '\nYou can close this window.\n'
exit "$status"
