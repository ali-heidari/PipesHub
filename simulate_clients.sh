#!/bin/bash
# Simulates 2 clients connecting to the same PipesHub node and messaging each other.
# Usage: ./simulate_clients.sh [node_ip]  (default: 192.168.101.11)

NODE="${1:-192.168.101.11}"
AUTH_PORT=16916
SOCKET_PORT=3000
AUTH_USER="${2:-guest}"   # must exist in MongoDB
MODULES="$(cd "$(dirname "$0")" && pwd)/node_modules"

die() { echo "[ERROR] $*" >&2; exit 1; }

auth() {
  local label="$1" node="$2" user="$3"
  echo "[*] Authenticating ${label} on ${node}..." >&2
  local tok status body
  tok=$(curl -sf -X POST "http://${node}:${AUTH_PORT}/auth" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "name=${user}") || die "Auth HTTP error for ${label}"
  [ -n "$tok" ] || die "Empty token for ${label}"
  echo "$tok"
}

# ── Auth ─────────────────────────────────────────────────────────────────────
TOKEN_A=$(auth clientA "$NODE" "$AUTH_USER") || exit 1
TOKEN_B=$(auth clientB "$NODE" "$AUTH_USER") || exit 1

# ── Client B: waits for a message, replies ────────────────────────────────────
CLIENT_B=$(mktemp /tmp/ph_clientB_XXXXXX.js)
cat > "$CLIENT_B" <<JSEOF
const io = require('${MODULES}/socket.io-client');
const socket = io('http://${NODE}:${SOCKET_PORT}', {
  transports: ['polling'],
  query: { name: 'clientB' },
  extraHeaders: { authorization: '${TOKEN_B}' }
});
socket.on('connect', () => console.log('[clientB] connected'));
socket.on('connect_error', (e) => { console.error('[clientB] connect error:', e.message); process.exit(1); });
socket.on('gateway', (data) => {
  // Server sends 200 as a connect-ack — ignore non-object frames
  if (typeof data !== 'object') return;
  console.log('[clientB] received: "' + data.input.text + '"');
  if (data.awaiting) {
    data.res = 'Hello back from clientB!';
    socket.emit('responseGateway', data);
  }
});
JSEOF

# ── Client A: sends a message, waits for reply ────────────────────────────────
CLIENT_A=$(mktemp /tmp/ph_clientA_XXXXXX.js)
cat > "$CLIENT_A" <<JSEOF
const io = require('${MODULES}/socket.io-client');
const socket = io('http://${NODE}:${SOCKET_PORT}', {
  transports: ['polling'],
  query: { name: 'clientA' },
  extraHeaders: { authorization: '${TOKEN_A}' }
});
socket.on('connect', () => {
  console.log('[clientA] connected');
  console.log('[clientA] sending message to clientB...');
  socket.emit('gateway', {
    senderId:   'clientA',
    receiverId: 'clientB',
    operation:  'message',
    input:      { text: 'Hello from clientA!' },
    awaiting:   true
  });
});
socket.on('responseGateway', (data) => {
  console.log('[clientA] got reply: "' + data.res + '"');
  socket.disconnect();
  process.exit(0);
});
socket.on('connect_error', (e) => { console.error('[clientA] connect error:', e.message); process.exit(1); });
setTimeout(() => { console.error('[clientA] timeout'); process.exit(1); }, 8000);
JSEOF

# ── Run ───────────────────────────────────────────────────────────────────────
cleanup() { kill "$B_PID" 2>/dev/null; rm -f "$CLIENT_A" "$CLIENT_B"; }
trap cleanup EXIT

echo "[*] Starting clientB..."
node "$CLIENT_B" &
B_PID=$!
sleep 1

echo "[*] Starting clientA..."
node "$CLIENT_A"
