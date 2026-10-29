#!/bin/sh
# Small installer tools, run as user 10001 with the runtime database address:
#   owner-made        exits 0 when the first Owner account exists, 3 when it does not
#   setup-property N  sets up the one Property named N (as scripts/local/setup-property.sh)
set -eu
. /opt/prm/common.sh
IFS= read -r APP_DATABASE_URL < "$PRM_SECRETS/runtime_database_url"
export APP_DATABASE_URL
cd /home/app
case "${1:-}" in
  owner-made)
    exec python3 -c 'import os, sys
from property_rental.property_setup_cli import owner_actor_id
sys.exit(0 if owner_actor_id(os.environ["APP_DATABASE_URL"]) else 3)' ;;
  setup-property)
    [ $# -eq 2 ] && [ -n "$2" ] || prm_fail "Give the Property name."
    exec python3 -m property_rental.property_setup_cli --name "$2" ;;
  *) prm_fail "Use: owner-made, or setup-property NAME" ;;
esac
