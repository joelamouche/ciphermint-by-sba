#!/usr/bin/env bash
set -euo pipefail

# Test CipherMint KYC API endpoints:
# - Get SIWE nonce
# - Create KYC session (Didit) using a real SIWE message + signature
#
# Requirements: curl, node, npm, python3.
# This script installs ethers + siwe locally into /tmp by default.
#
# Inputs (env):
#   PUBLIC_ADDRESS  (required) - wallet address (0x-prefixed)
#   PRIVATE_KEY     (required) - wallet private key (0x-prefixed)
#   API_URL         (optional) - defaults to http://localhost:3000
#   ENCRYPTION_KEY  (optional) - defaults to TEST_ENCRYPTION_KEY
#   SIWE_DOMAIN     (optional) - defaults to localhost:3000
#   SIWE_URI        (optional) - defaults to http://localhost:3000
#   CHAIN_ID        (optional) - defaults to 1
#
# Usage:
#   cd backend
#   chmod +x scripts/test-kyc-session.sh
#   PUBLIC_ADDRESS=0x... PRIVATE_KEY=0x... ./scripts/test-kyc-session.sh

API_URL="${API_URL:-http://localhost:3000}"
ADDRESS="${PUBLIC_ADDRESS:-}"
PRIVATE_KEY="${PRIVATE_KEY:-}"
ENCRYPTION_KEY="${ENCRYPTION_KEY:-TEST_ENCRYPTION_KEY}"
SIWE_DOMAIN="${SIWE_DOMAIN:-localhost:3000}"
SIWE_URI="${SIWE_URI:-http://localhost:3000}"
CHAIN_ID="${CHAIN_ID:-1}"

if [[ -z "${ADDRESS}" ]]; then
  read -r -p "Enter PUBLIC_ADDRESS (0x...): " ADDRESS
fi
if [[ -z "${PRIVATE_KEY}" ]]; then
  read -r -s -p "Enter PRIVATE_KEY (0x..., hidden): " PRIVATE_KEY
  echo
fi
if [[ -z "${ADDRESS}" || -z "${PRIVATE_KEY}" ]]; then
  echo "PUBLIC_ADDRESS and PRIVATE_KEY are required. Aborting."
  exit 1
fi

TOOLS_DIR="${TOOLS_DIR:-/tmp/ciphermint-siwe-tools}"
export NODE_PATH="${TOOLS_DIR}/node_modules${NODE_PATH:+:${NODE_PATH}}"
export PATH="${TOOLS_DIR}/node_modules/.bin:${PATH}"

# Ensure ethers + siwe are available without polluting the repo.
if ! node -e "require('ethers'); require('siwe');" >/dev/null 2>&1; then
  echo "Installing ethers@6 and siwe to ${TOOLS_DIR}..."
  mkdir -p "${TOOLS_DIR}"
  npm install --prefix "${TOOLS_DIR}" ethers@6 siwe >/dev/null
fi

echo "Fetching nonce for ${ADDRESS}..."
nonce_resp="$(curl -sS "${API_URL}/api/auth/nonce?walletAddress=${ADDRESS}")"
echo "Nonce response: ${nonce_resp}"

nonce="$(RESP="${nonce_resp}" python3 - <<'PY'
import json, os, sys
try:
  data = json.loads(os.environ["RESP"])
  print(data["nonce"])
except Exception as e:
  sys.exit(1)
PY
)"

if [[ -z "${nonce}" ]]; then
  echo "Failed to parse nonce from response"
  exit 1
fi

echo "Building SIWE message and signing..."
siwe_json="$(
  ADDRESS="${ADDRESS}" PRIVATE_KEY="${PRIVATE_KEY}" NONCE="${nonce}" \
  SIWE_DOMAIN="${SIWE_DOMAIN}" SIWE_URI="${SIWE_URI}" CHAIN_ID="${CHAIN_ID}" \
  node <<'NODE'
const { Wallet } = require('ethers');
const { SiweMessage } = require('siwe');

const address = process.env.ADDRESS;
const pk = process.env.PRIVATE_KEY;
const nonce = process.env.NONCE;
const domain = process.env.SIWE_DOMAIN || 'localhost:3000';
const uri = process.env.SIWE_URI || 'http://localhost:3000';
const chainId = parseInt(process.env.CHAIN_ID || '1', 10);

if (!address || !pk || !nonce) {
  console.error("Missing ADDRESS, PRIVATE_KEY or NONCE");
  process.exit(1);
}

const wallet = new Wallet(pk);
if (wallet.address.toLowerCase() !== address.toLowerCase()) {
  console.error(`Private key does not match address. Wallet: ${wallet.address}, Provided: ${address}`);
  process.exit(1);
}

const msg = new SiweMessage({
  domain,
  address,
  statement: 'Sign in to CipherMint KYC.',
  uri,
  version: '1',
  chainId,
  nonce,
});

(async () => {
  const prepared = msg.prepareMessage();
  const signature = await wallet.signMessage(prepared);
  console.log(JSON.stringify({ siweMessage: prepared, siweSignature: signature }));
})();
NODE
)"

if [[ -z "${siwe_json}" ]]; then
  echo "Failed to build SIWE message"
  exit 1
fi

siwe_message="$(RESP="${siwe_json}" python3 - <<'PY'
import json, os, sys
try:
  data = json.loads(os.environ["RESP"])
  print(data["siweMessage"])
except Exception:
  sys.exit(1)
PY
)"

siwe_signature="$(RESP="${siwe_json}" python3 - <<'PY'
import json, os, sys
try:
  data = json.loads(os.environ["RESP"])
  print(data["siweSignature"])
except Exception:
  sys.exit(1)
PY
)"

if [[ -z "${siwe_message}" || -z "${siwe_signature}" ]]; then
  echo "Failed to parse SIWE message or signature"
  exit 1
fi

echo "SIWE message:"
echo "----------------------------------------"
echo "${siwe_message}"
echo "----------------------------------------"
echo "Signature: ${siwe_signature}"

payload=$(python3 - <<PY
import json
print(json.dumps({
  "walletAddress": "${ADDRESS}",
  "siweMessage": """${siwe_message}""",
  "siweSignature": "${siwe_signature}",
  "encryptionKey": "${ENCRYPTION_KEY}"
}))
PY
)

echo "Creating KYC session..."
kyc_tmp="$(mktemp)"
kyc_status="$(curl -sS -o "${kyc_tmp}" -w "%{http_code}" \
  -X POST \
  -H "Content-Type: application/json" \
  -d "${payload}" \
  "${API_URL}/api/kyc/session")"
kyc_resp="$(cat "${kyc_tmp}")"
rm -f "${kyc_tmp}"

echo "KYC session HTTP ${kyc_status}: ${kyc_resp}"
if [[ "${kyc_status}" != "200" ]]; then
  echo "KYC session creation failed with status ${kyc_status}"
  exit 1
fi

echo "Done."

