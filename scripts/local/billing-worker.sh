#!/bin/sh
# Runs the scheduled billing worker on the Mac mini test run (owner ask 17/11/2026: "the test
# app should start the billing worker so payments go into the books"). Each pass does what the
# worker does on the office server: the billing runs that are due, the automatic late-payment
# charges, posting the money records to the ledger, and turning off the app user of a leaver.
# A pass runs every 60 seconds, so a payment reaches the books within about a minute.
# Started by start-test-app.sh; it stops with the test app. Each pass is logged to
# .local/billing.log; nothing secret is printed.
set -eu
. "$(dirname -- "$0")/common.sh"

PRM_BILLING_EVERY=60
# Not named "file": prm_export_password_files below uses that name for its own loop.
financial_url_file="$PRM_SECRETS/financial_database_url"
[ -s "$financial_url_file" ] || prm_fail "Missing $financial_url_file. Run: sh scripts/local/make-secrets.sh"

# The Property's billing service principal (made when the Property was set up). The test app has
# one Property; more than one principal is refused rather than guessed.
prm_export_password_files
cd "$PRM_ROOT"
principals=$(docker compose exec -T postgres psql -U prm_admin -d prm -Atc \
  "SELECT property_id || ' ' || actor_id FROM app.billing_service_principals
   WHERE capability = 'billing.generate' AND lifecycle_state = 'active'")
count=$(printf '%s\n' "$principals" | grep -c . || true)
[ "$count" -eq 1 ] || prm_fail "Expected one active billing service principal, found $count."
property_id=${principals% *}
actor_id=${principals#* }

IFS= read -r APP_FINANCIAL_DATABASE_URL < "$financial_url_file"
export APP_FINANCIAL_DATABASE_URL
cd "$PRM_ROOT/backend"
# --max-iterations is the worker's bounded loop; a very large number keeps it running until the
# test app stops.
exec uv run --quiet property-rental-scheduled-billing \
  --property-id "$property_id" --actor-id "$actor_id" \
  --max-iterations 1000000 --poll-interval-seconds "$PRM_BILLING_EVERY"
