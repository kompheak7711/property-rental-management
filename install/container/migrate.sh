#!/bin/sh
# Applies any new reviewed migration (as scripts/local/migrate.sh); runs on every start.
set -eu
. /opt/prm/common.sh
IFS= read -r MIGRATION_DATABASE_URL < "$PRM_SECRETS/migration_database_url"
export MIGRATION_DATABASE_URL
cd /home/app
exec alembic upgrade head
