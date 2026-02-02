#!/usr/bin/env bash
set -euo pipefail

APP_NAME="${HEROKU_APP_NAME:-ciphermint-frontend}"
FRONTEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${FRONTEND_DIR}/.env.deploy"

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

CONFIG_SET_ARGS=()
while IFS='=' read -r key value; do
  if [[ "${key}" == VITE_* ]] || [[ "${key}" == NODE_ENV ]]; then
    CONFIG_SET_ARGS+=("${key}=${value}")
  fi
done < <(env)

if [[ ${#CONFIG_SET_ARGS[@]} -gt 0 ]]; then
  heroku config:set -a "${APP_NAME}" "${CONFIG_SET_ARGS[@]}"
fi

heroku container:login
(
  cd "${FRONTEND_DIR}"
  heroku container:push web -a "${APP_NAME}"
)
heroku container:release web -a "${APP_NAME}"

heroku open -a "${APP_NAME}" || true
