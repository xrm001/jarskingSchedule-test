ALTER TABLE schedule_entries
  ADD COLUMN IF NOT EXISTS schedule_kind text;

ALTER TABLE schedule_entries
  DROP CONSTRAINT IF EXISTS schedule_entries_schedule_kind_check;

ALTER TABLE schedule_entries
  ADD CONSTRAINT schedule_entries_schedule_kind_check
  CHECK (schedule_kind IS NULL OR schedule_kind IN ('personal','out','meeting'));

UPDATE schedule_entries
SET schedule_kind = CASE
  WHEN source_type IN ('ORGANIZED_MEETING','APPROVED_REQUEST') THEN 'meeting'
  WHEN source_type = 'STATUS_BLOCK' AND title = '会议中' THEN 'meeting'
  WHEN source_type = 'STATUS_BLOCK' THEN 'out'
  WHEN source_type = 'PERSONAL' THEN 'personal'
  ELSE schedule_kind
END
WHERE schedule_kind IS NULL;
