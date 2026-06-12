#!/usr/bin/env sh

set -eu

SCRIPT_DIR=$(
    CDPATH= cd -- "$(dirname -- "$0")" && pwd
)

cd "$SCRIPT_DIR"

NODE_VERSION="${NODE_VERSION:-20}"
API_PORT="${API_PORT:-8080}"
APIGEE_ORGANIZATION="${APIGEE_ORGANIZATION:-mmc-bedford-int-non-prod}"
APIGEE_CLIENT_ID="${APIGEE_CLIENT_ID:-uw57oNG4XPi8IiMnYJJ0uMaWHQAcZY3mhGobmiuxXKGW2NQ5}"
BYPASS_AUTH="${BYPASS_AUTH:-false}"
LOCAL_MONGO_CONTAINER="${LOCAL_MONGO_CONTAINER:-operational-dashboard-mongo}"
LOCAL_MONGO_URL="${LOCAL_MONGO_URL:-mongodb://127.0.0.1:27018/operational_dashboard}"

ensure_node_20() {
    node_major=""

    if command -v node >/dev/null 2>&1; then
        node_major="$(node -p "process.versions.node.split('.')[0]" 2>/dev/null || true)"
    fi

    if [ "$node_major" = "20" ]; then
        return
    fi

    NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
    if [ ! -s "${NVM_DIR}/nvm.sh" ]; then
        echo "Node.js 20 is required. Install it or set NVM_DIR so the script can switch versions." >&2
        exit 1
    fi

    # shellcheck disable=SC1090
    . "${NVM_DIR}/nvm.sh"
    nvm use "$NODE_VERSION" >/dev/null

    node_major="$(node -p "process.versions.node.split('.')[0]")"
    if [ "$node_major" != "20" ]; then
        echo "Expected Node.js 20 but found $(node -v)." >&2
        exit 1
    fi
}

configure_local_mongo() {
    if [ -n "${API_MONGODB_API_DB_URL:-}" ]; then
        echo "Using MongoDB at ${API_MONGODB_API_DB_URL}"
        return
    fi

    if [ -n "${API_MONGODB_DB_URL:-}" ]; then
        echo "Using MongoDB at ${API_MONGODB_DB_URL}"
        return
    fi

    if command -v docker >/dev/null 2>&1 &&
        docker ps --format '{{.Names}}' | grep -qx "$LOCAL_MONGO_CONTAINER"; then
        API_MONGODB_API_DB_URL="$LOCAL_MONGO_URL"
        export API_MONGODB_API_DB_URL
        echo "Using local MongoDB container at ${API_MONGODB_API_DB_URL}"
        return
    fi

    echo "No MongoDB URL configured; API will use seeded in-memory data."
}

cleanup() {
    exit_code=$?
    trap - INT TERM EXIT

    if [ -n "${API_PID:-}" ] && kill -0 "$API_PID" 2>/dev/null; then
        kill "$API_PID" 2>/dev/null || true
    fi

    if [ -n "${UI_PID:-}" ] && kill -0 "$UI_PID" 2>/dev/null; then
        kill "$UI_PID" 2>/dev/null || true
    fi

    if [ -n "${API_PID:-}" ]; then
        wait "$API_PID" 2>/dev/null || true
    fi

    if [ -n "${UI_PID:-}" ]; then
        wait "$UI_PID" 2>/dev/null || true
    fi

    exit "$exit_code"
}

ensure_node_20

if [ ! -d node_modules ]; then
    echo "Dependencies are missing. Run npm install first." >&2
    exit 1
fi

configure_local_mongo

trap cleanup INT TERM EXIT

echo "Using Node $(node -v)"
echo "Starting API at http://localhost:${API_PORT}/api/v1"
APIGEE_ORGANIZATION="$APIGEE_ORGANIZATION" \
APIGEE_CLIENT_ID="$APIGEE_CLIENT_ID" \
BYPASS_AUTH="$BYPASS_AUTH" \
API_PORT="$API_PORT" \
npm run start:api &
API_PID=$!

echo "Starting UI at http://localhost:4200"
npm run start:ui &
UI_PID=$!

echo "Press Ctrl+C to stop both services."

wait "$API_PID"
wait "$UI_PID"