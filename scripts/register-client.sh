#!/usr/bin/env bash
# Registers a public PKCE OAuth2 client against an OpenEMR instance and prints
# the resulting client_id. Run once per OpenEMR deployment (e.g. local docker,
# staging, prod). The returned client_id goes into patient-portal/.env.local.
#
# Usage:
#   bash scripts/register-client.sh                                    # local docker default
#   OAUTH_BASE_URL=https://openemr.example.com/oauth2/default \
#     REDIRECT_URI=https://patient-portal.example.com/oauth-callback \
#     bash scripts/register-client.sh
#
# After this script exits 0, you must ALSO open the OpenEMR admin UI:
#   Admin → System → API Clients → enable the new entry.

set -euo pipefail

OAUTH_BASE_URL="${OAUTH_BASE_URL:-https://localhost:9300/oauth2/default}"
REDIRECT_URI="${REDIRECT_URI:-https://localhost:5173/oauth-callback}"
APP_NAME="${APP_NAME:-OpenEMR Patient Dashboard SPA}"
CONTACT_EMAIL="${CONTACT_EMAIL:-portal-admin@example.com}"

SCOPE="openid offline_access \
user/Patient.rs user/AllergyIntolerance.rs user/Condition.rs \
user/MedicationRequest.rs user/MedicationStatement.rs \
user/CareTeam.rs user/Encounter.rs"

PAYLOAD=$(cat <<JSON
{
  "application_type": "public",
  "redirect_uris": ["${REDIRECT_URI}"],
  "post_logout_redirect_uris": ["${REDIRECT_URI%/oauth-callback}"],
  "client_name": "${APP_NAME}",
  "token_endpoint_auth_method": "none",
  "contacts": ["${CONTACT_EMAIL}"],
  "scope": "${SCOPE}"
}
JSON
)

echo "Registering client at: ${OAUTH_BASE_URL}/registration"
echo "Redirect URI:           ${REDIRECT_URI}"
echo

RESPONSE=$(curl -fsSk -X POST "${OAUTH_BASE_URL}/registration" \
  -H 'Content-Type: application/json' \
  -d "${PAYLOAD}")

echo "Raw response:"
echo "${RESPONSE}" | python3 -m json.tool 2>/dev/null || echo "${RESPONSE}"
echo

CLIENT_ID=$(echo "${RESPONSE}" | python3 -c 'import sys,json; print(json.load(sys.stdin)["client_id"])')

echo "client_id: ${CLIENT_ID}"
echo
echo "Next steps:"
echo "  1. Paste this into .env.local:  VITE_CLIENT_ID=${CLIENT_ID}"
echo "  2. Open OpenEMR admin → System → API Clients → enable this client."
