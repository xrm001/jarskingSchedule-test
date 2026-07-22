#!/bin/sh
set -eu

echo oauth_state_summary
sudo docker exec jarsking_schedule_db sh -lc \
  'psql -At -F "|" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT count(*) FILTER (WHERE consumed_at IS NULL AND expires_at>now()), count(*) FILTER (WHERE consumed_at IS NOT NULL), count(*) FILTER (WHERE expires_at<=now()) FROM oauth_states WHERE created_at>now()-interval '\''30 minutes'\''"'

echo session_summary
sudo docker exec jarsking_schedule_db sh -lc \
  'psql -At -F "|" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT count(*), count(*) FILTER (WHERE revoked_at IS NULL AND expires_at>now()) FROM auth_sessions WHERE created_at>now()-interval '\''30 minutes'\''"'

echo api_logs
sudo docker logs --since 30m jarsking_schedule_api 2>&1 | tail -80
