ALTER TABLE meeting_requests
  ADD COLUMN IF NOT EXISTS approval_meeting_mode text
  CHECK (approval_meeting_mode IN ('FACE_TO_FACE', 'REMOTE'));

ALTER TABLE schedule_entries
  ADD COLUMN IF NOT EXISTS approval_meeting_mode text
  CHECK (approval_meeting_mode IN ('FACE_TO_FACE', 'REMOTE'));

ALTER TABLE approval_decisions
  ADD COLUMN IF NOT EXISTS approval_meeting_mode text
  CHECK (approval_meeting_mode IN ('FACE_TO_FACE', 'REMOTE'));
