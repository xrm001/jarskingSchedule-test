ALTER TABLE meeting_requests
  ADD COLUMN approved_schedule_id uuid REFERENCES schedule_entries(id);
