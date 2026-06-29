#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${PROJECT_DIR}"

if ! command -v node >/dev/null 2>&1; then
  echo "FAIL node is not installed. Install Node.js 20+ first."
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "FAIL npm is not installed. Install Node.js 20+ with npm first."
  exit 1
fi

echo "Node: $(node --version)"
echo "npm: $(npm --version)"

npm install
mkdir -p data
npm run build

if [ ! -f ".env" ]; then
  echo "FAIL .env is missing."
  echo "Run: cp .env.example .env"
  echo "Then edit .env and rerun this script."
  exit 1
fi

echo ".env detected. Runtime settings:"
awk -F= '/^(PORT|HOST|DATABASE_PATH|WEIBO_CLI_BIN|FREE_MODE|MOCK_WEIBO)=/ { print "  " $1 "=" $2 }' .env

npm run start
