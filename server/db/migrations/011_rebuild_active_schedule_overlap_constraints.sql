CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE schedule_entries DROP CONSTRAINT IF EXISTS no_active_boss_overlap;
ALTER TABLE schedule_entries DROP CONSTRAINT IF EXISTS no_active_room_overlap;

ALTER TABLE schedule_entries ADD CONSTRAINT no_active_boss_overlap
  EXCLUDE USING gist (
    boss_user_id WITH =,
    tstzrange(start_at, end_at, '[)') WITH &&
  ) WHERE (status = 'ACTIVE');

ALTER TABLE schedule_entries ADD CONSTRAINT no_active_room_overlap
  EXCLUDE USING gist (
    room_id WITH =,
    tstzrange(start_at, end_at, '[)') WITH &&
  ) WHERE (status = 'ACTIVE' AND room_id IS NOT NULL);
