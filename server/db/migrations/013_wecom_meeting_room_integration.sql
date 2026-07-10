ALTER TABLE meeting_rooms
  ADD COLUMN IF NOT EXISTS wecom_meetingroom_id bigint UNIQUE;

ALTER TABLE schedule_entries
  ADD COLUMN IF NOT EXISTS wecom_meeting_id text,
  ADD COLUMN IF NOT EXISTS wecom_schedule_id text,
  ADD COLUMN IF NOT EXISTS wecom_room_sync_status text NOT NULL DEFAULT 'NOT_CONFIGURED',
  ADD COLUMN IF NOT EXISTS wecom_room_sync_error text;

CREATE INDEX IF NOT EXISTS schedule_entries_wecom_meeting_id_idx
  ON schedule_entries (wecom_meeting_id)
  WHERE wecom_meeting_id IS NOT NULL;
