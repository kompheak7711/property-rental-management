#!/bin/sh
# Makes a full database backup in the backups folder.
cd "$(dirname -- "$0")" || exit 1
PRM_HOME=$(pwd)
export PRM_HOME
sh app/install/mac/backup.sh
status=$?
printf '\nYou can close this window.\n'
exit "$status"
