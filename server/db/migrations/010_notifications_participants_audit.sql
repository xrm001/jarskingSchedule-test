CREATE TABLE IF NOT EXISTS organized_meeting_participants (
  schedule_id uuid NOT NULL REFERENCES schedule_entries(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES app_users(id),
  participant_type text NOT NULL DEFAULT 'ATTENDEE' CHECK (participant_type IN ('ORGANIZER', 'ATTENDEE')),
  notified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (schedule_id, user_id)
);

CREATE INDEX IF NOT EXISTS organized_meeting_participants_user_idx
  ON organized_meeting_participants (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS notification_inbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_outbox_id uuid UNIQUE REFERENCES notification_outbox(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  aggregate_type text NOT NULL,
  aggregate_id uuid NOT NULL,
  recipient_user_id uuid NOT NULL REFERENCES app_users(id),
  title text NOT NULL,
  detail text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notification_inbox_recipient_idx
  ON notification_inbox (recipient_user_id, created_at DESC);

ALTER TABLE voice_commands
  ADD COLUMN IF NOT EXISTS executed_entity_type text,
  ADD COLUMN IF NOT EXISTS executed_entity_id uuid,
  ADD COLUMN IF NOT EXISTS execution_payload jsonb,
  ADD COLUMN IF NOT EXISTS execution_error text;

CREATE INDEX IF NOT EXISTS voice_commands_execution_idx
  ON voice_commands (executed_entity_type, executed_entity_id)
  WHERE executed_entity_id IS NOT NULL;
