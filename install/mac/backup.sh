#!/bin/sh
# Makes a full copy of the installed app's database in the "backups" folder next to the
# installer. The file holds all customer and money data: keep it safe and copy it to a USB drive.
set -eu
. "$(dirname -- "$0")/common.sh"
prm_docker_ready
prm_compose up -d --wait postgres >/dev/null
folder="$PRM_HOME/backups"
umask 077
mkdir -p "$folder"
file="$folder/chetana-$(date +%Y-%m-%d-%H%M).dump"
prm_compose exec -T --user postgres postgres sh -c \
  'umask 077 && pg_dump -U prm_admin -d prm --format=custom --file=/tmp/chetana-backup.dump' ||
  prm_fail "The backup did not work."
prm_compose cp postgres:/tmp/chetana-backup.dump "$file" >/dev/null || prm_fail "The backup file could not be copied."
prm_compose exec -T --user postgres postgres rm -f /tmp/chetana-backup.dump
chmod 0600 "$file"
printf 'Backup made: %s\n' "$file"
printf 'Copy it to a USB drive and keep it safe: it holds all customer and money data.\n'
