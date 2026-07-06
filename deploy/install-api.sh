#!/bin/sh
set -eu

IMAGE="${1:-jarsking-schedule-api:20260706}"
NETWORK="${JARSKING_DOCKER_NETWORK:-deploy_default}"
DB_CONTAINER="${JARSKING_DB_CONTAINER:-jarsking_schedule_db}"
ENV_DIR=/opt/jarsking-schedule/env
RUNTIME_ENV="$ENV_DIR/backend-runtime.env"

boss_record="$(sudo docker exec "$DB_CONTAINER" sh -lc \
  'psql -At -F "|" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT u.id, u.wecom_user_id FROM app_users u JOIN user_roles r ON r.user_id=u.id WHERE r.role='"'"'BOSS'"'"' AND u.status='"'"'ACTIVE'"'"' LIMIT 1"')"
boss_id="$(printf '%s' "$boss_record" | cut -d '|' -f 1)"
boss_wecom_id="$(printf '%s' "$boss_record" | cut -d '|' -f 2-)"

if [ -z "$boss_id" ] || [ -z "$boss_wecom_id" ]; then
  echo "Active boss identity is missing from the database" >&2
  exit 1
fi

sudo cp "$ENV_DIR/backend-database.env" "$RUNTIME_ENV"
if [ -f "$ENV_DIR/backend-wecom.env" ]; then
  sudo sh -c "cat '$ENV_DIR/backend-wecom.env' >> '$RUNTIME_ENV'"
fi
printf 'NODE_ENV=production\nPORT=3000\nBOSS_APP_USER_ID=%s\nBOSS_WECOM_USER_ID=%s\n' \
  "$boss_id" "$boss_wecom_id" | sudo tee -a "$RUNTIME_ENV" >/dev/null
sudo chmod 600 "$RUNTIME_ENV"

sudo docker rm -f jarsking_schedule_api >/dev/null 2>&1 || true
sudo docker run -d \
  --name jarsking_schedule_api \
  --restart unless-stopped \
  --network "$NETWORK" \
  --env-file "$RUNTIME_ENV" \
  "$IMAGE" >/dev/null

sleep 2
sudo docker exec jarsking_schedule_api node -e \
  "fetch('http://127.0.0.1:3000/api/v1/health').then(async r => { console.log(await r.text()); if (!r.ok) process.exit(1) })"
