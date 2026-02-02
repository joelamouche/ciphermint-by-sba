#!/usr/bin/env bash
set -euo pipefail

APP_NAME="ciphermint-api"
BACKEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${BACKEND_DIR}/.env.deploy"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Missing ${ENV_FILE}. Create it before deploying."
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

if ! heroku apps:info -a "${APP_NAME}" >/dev/null 2>&1; then
  heroku create "${APP_NAME}" --stack container
fi

heroku stack:set container -a "${APP_NAME}"

CONFIG_KEYS=(
  NODE_ENV
  DIDIT_API_KEY
  DIDIT_WORKFLOW_ID
  DIDIT_WEBHOOK_SECRET
  ZAMA_IDENTITY_REGISTRY_ADDRESS
  ZAMA_REGISTRAR_PRIVATE_KEY
  ZAMA_RPC_URL
  ZAMA_CHAIN_ID
  INTEGRATION_TESTS_ENABLED
  TEST_USER_ADDRESS
)

CONFIG_SET_ARGS=()
for key in "${CONFIG_KEYS[@]}"; do
  if [[ -n "${!key-}" ]]; then
    CONFIG_SET_ARGS+=("${key}=${!key}")
  fi
done

if [[ ${#CONFIG_SET_ARGS[@]} -gt 0 ]]; then
  heroku config:set -a "${APP_NAME}" "${CONFIG_SET_ARGS[@]}"
fi

heroku container:login
(
  cd "${BACKEND_DIR}"
  heroku container:push web -a "${APP_NAME}"
)
heroku container:release web -a "${APP_NAME}"

heroku open -a "${APP_NAME}" || true
WEB_URL="$(heroku apps:info -a "${APP_NAME}" | awk -F': ' '/Web URL/ {print $2}')"
WEB_URL="${WEB_URL:-https://${APP_NAME}.herokuapp.com/}"
echo "Health check:"
curl -fsS "${WEB_URL}health" || true
