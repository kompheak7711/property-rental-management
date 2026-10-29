#!/bin/sh
# Makes the V1 installer zip (owner ask 29/10/2026) from the committed files of HEAD:
#
#   sh scripts/package-installer.sh [output.zip]
#
# The zip holds one folder, CHETANA-V1, with the launchers and READ ME FIRST.txt on top
# (install/launchers) and only the files the installed app is built from in "app". Nothing
# uncommitted, no .local folder and no secret goes in. Line ends follow install/.gitattributes.
set -eu
root=$(git rev-parse --show-toplevel)
cd "$root"
output=${1:-dist/CHETANA-V1-Installer.zip}
mkdir -p "$(dirname -- "$output")"
output=$(CDPATH= cd -- "$(dirname -- "$output")" && pwd)/$(basename -- "$output")
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
top="$work/CHETANA-V1"
mkdir -p "$top/app"
git archive --format=tar HEAD \
  backend/pyproject.toml backend/uv.lock backend/src backend/alembic.ini backend/migrations \
  frontend config/password-blocklist.txt scripts/postgres-init.sh \
  scripts/local/with-protected-key.py install |
  tar -x -C "$top/app"
mv "$top/app/install/launchers/"* "$top/"
rmdir "$top/app/install/launchers"
printf 'CHETANA Residence Management V1, built from commit %s\r\n' "$(git rev-parse --short HEAD)" \
  > "$top/app/VERSION.txt"
rm -f "$output"
(cd "$work" && zip -qrX "$output" CHETANA-V1)
printf 'Made %s\n' "$output"
