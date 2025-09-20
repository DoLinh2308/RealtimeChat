#!/bin/bash
set -euo pipefail

# --- CONFIG ---
NGROK_API="http://127.0.0.1:4040/api/tunnels"
CLIENT_PORT="http://localhost:3000"
API_PORT="http://localhost:8080"
ENV_DEV="client/.env.development"
ENV_LOCAL="client/.env.local"
COMPOSE_OVERRIDE="docker-compose.override.yml"
COMPOSE_CMD="${COMPOSE_CMD:-docker compose}"

# --- CHECK DEP ---
for cmd in curl jq docker; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "[ERR] Thiếu lệnh $cmd. Cài đặt trước (ví dụ: sudo apt install $cmd)." >&2
    exit 1
  fi
done

# --- GET URL ---
echo "[INFO] Đọc tunnel từ ngrok API..."
JSON=$(curl -sf "$NGROK_API") || {
  echo "[ERR] Không truy cập được $NGROK_API. Đảm bảo ngrok đang chạy (ngrok start --all)." >&2
  exit 1
}

CLIENT_URL=$(echo "$JSON" | jq -r --arg addr "$CLIENT_PORT" '.tunnels[] | select(.config.addr==$addr) | .public_url' | head -n1)
API_URL=$(echo "$JSON" | jq -r --arg addr "$API_PORT" '.tunnels[] | select(.config.addr==$addr) | .public_url' | head -n1)

if [[ -z "$CLIENT_URL" || -z "$API_URL" || "$CLIENT_URL" == "null" || "$API_URL" == "null" ]]; then
  echo "[ERR] Không tìm thấy tunnel cho $CLIENT_PORT hoặc $API_PORT. Kiểm tra realtimechat.yml và khởi chạy ngrok." >&2
  exit 1
fi

echo "[INFO] Client URL: $CLIENT_URL"
echo "[INFO] API URL   : $API_URL"

# --- UPDATE CLIENT ENVs ---
echo "[INFO] Ghi $ENV_DEV ..."
cat >"$ENV_DEV" <<EOF
# Tự động tạo bởi scripts/ngrok-sync.sh
VITE_API_URL=$API_URL
VITE_GIPHY_KEY=your_optional_giphy_key
EOF

echo "[INFO] Ghi $ENV_LOCAL ..."
cat >"$ENV_LOCAL" <<EOF
# Tự động tạo bởi scripts/ngrok-sync.sh
VITE_API_URL=$API_URL
VITE_GIPHY_KEY=your_optional_giphy_key
EOF

# --- UPDATE DOCKER COMPOSE OVERRIDE ---
echo "[INFO] Ghi $COMPOSE_OVERRIDE ..."
cat >"$COMPOSE_OVERRIDE" <<EOF
services:
  api:
    environment:
      - CORS__Origins=$CLIENT_URL
EOF

# --- RESTART CONTAINERS ---
echo "[INFO] Restart containers (api, client)..."
$COMPOSE_CMD up -d --build api client

echo "[DONE] ✅ Ngrok cấu hình hoàn tất"
echo "👉 Mở web tại: $CLIENT_URL"
echo "👉 API endpoint: $API_URL"

