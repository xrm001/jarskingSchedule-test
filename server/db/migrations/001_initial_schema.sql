CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TYPE app_role AS ENUM ('BOSS', 'MANAGEMENT', 'ADMIN');
CREATE TYPE account_status AS ENUM ('PENDING_BINDING', 'ACTIVE', 'DISABLED');
CREATE TYPE boss_presence AS ENUM ('AVAILABLE', 'MEETING', 'OUT', 'DND');
CREATE TYPE content_visibility AS ENUM ('ALL_MEMBERS', 'BOSS_ONLY');
CREATE TYPE request_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED');
CREATE TYPE schedule_source AS ENUM ('PERSONAL', 'APPROVED_REQUEST', 'ORGANIZED_MEETING', 'STATUS_BLOCK');
CREATE TYPE schedule_status AS ENUM ('ACTIVE', 'CANCELLED', 'COMPLETED');
CREATE TYPE confirmation_status AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED', 'EXECUTED', 'FAILED');
CREATE TYPE outbox_status AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED');

CREATE TABLE app_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wecom_user_id text UNIQUE,
  display_name text NOT NULL CHECK (length(btrim(display_name)) > 0),
  job_title text,
  department text,
  status account_status NOT NULL DEFAULT 'PENDING_BINDING',
  source text NOT NULL DEFAULT 'MANUAL' CHECK (source IN ('EXCEL', 'WECOM', 'MANUAL')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz
);

CREATE INDEX app_users_display_name_idx ON app_users (display_name);
CREATE INDEX app_users_active_idx ON app_users (status) WHERE removed_at IS NULL;

CREATE TABLE user_roles (
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  granted_by uuid REFERENCES app_users(id),
  PRIMARY KEY (user_id, role)
);

CREATE UNIQUE INDEX exactly_one_active_boss_role_idx
  ON user_roles ((role)) WHERE role = 'BOSS';

CREATE TABLE boss_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  boss_user_id uuid NOT NULL REFERENCES app_users(id),
  status boss_presence NOT NULL,
  start_at timestamptz NOT NULL DEFAULT now(),
  end_at timestamptz,
  is_current boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_at IS NULL OR end_at > start_at)
);

CREATE UNIQUE INDEX one_current_boss_status_idx
  ON boss_status_history (boss_user_id) WHERE is_current;

CREATE TABLE meeting_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  floor smallint,
  capacity integer CHECK (capacity IS NULL OR capacity > 0),
  equipment text,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE meeting_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  boss_user_id uuid NOT NULL REFERENCES app_users(id),
  applicant_user_id uuid NOT NULL REFERENCES app_users(id),
  room_id uuid REFERENCES meeting_rooms(id),
  topic text NOT NULL CHECK (length(btrim(topic)) > 0),
  meeting_content text,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  visibility content_visibility NOT NULL,
  status request_status NOT NULL DEFAULT 'PENDING',
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  decided_by uuid REFERENCES app_users(id),
  decided_at timestamptz,
  rejection_source text CHECK (rejection_source IN ('MANUAL', 'OVERLAP_AUTO')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_at > start_at)
);

CREATE INDEX meeting_requests_boss_time_idx ON meeting_requests (boss_user_id, start_at, end_at);
CREATE INDEX meeting_requests_applicant_idx ON meeting_requests (applicant_user_id, created_at DESC);
CREATE INDEX meeting_requests_pending_idx ON meeting_requests (boss_user_id, start_at) WHERE status = 'PENDING';

CREATE TABLE meeting_participants (
  request_id uuid NOT NULL REFERENCES meeting_requests(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES app_users(id),
  participant_type text NOT NULL DEFAULT 'ATTENDEE' CHECK (participant_type IN ('ORGANIZER', 'ATTENDEE')),
  notified_at timestamptz,
  PRIMARY KEY (request_id, user_id)
);

CREATE TABLE schedule_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  boss_user_id uuid NOT NULL REFERENCES app_users(id),
  room_id uuid REFERENCES meeting_rooms(id),
  source_type schedule_source NOT NULL,
  source_id uuid,
  title text,
  meeting_content text,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  visibility content_visibility NOT NULL,
  status schedule_status NOT NULL DEFAULT 'ACTIVE',
  created_by uuid NOT NULL REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_at > start_at)
);

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

CREATE TABLE approval_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES meeting_requests(id),
  decision request_status NOT NULL CHECK (decision IN ('APPROVED', 'REJECTED')),
  decided_by uuid NOT NULL REFERENCES app_users(id),
  rejection_source text CHECK (rejection_source IN ('MANUAL', 'OVERLAP_AUTO')),
  decided_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE notification_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  aggregate_type text NOT NULL,
  aggregate_id uuid NOT NULL,
  recipient_user_id uuid NOT NULL REFERENCES app_users(id),
  dedupe_key text NOT NULL UNIQUE,
  payload jsonb NOT NULL,
  status outbox_status NOT NULL DEFAULT 'PENDING',
  available_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX notification_outbox_ready_idx
  ON notification_outbox (available_at, created_at) WHERE status IN ('PENDING', 'FAILED');

CREATE TABLE voice_commands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_users(id),
  transcript text NOT NULL,
  intent text NOT NULL,
  parsed_payload jsonb NOT NULL,
  visibility_detected boolean,
  confirmation_status confirmation_status NOT NULL DEFAULT 'PENDING',
  confirmation_hash text NOT NULL,
  confirmed_at timestamptz,
  executed_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX voice_commands_user_created_idx ON voice_commands (user_id, created_at DESC);

CREATE TABLE audit_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_user_id uuid REFERENCES app_users(id),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  before_data jsonb,
  after_data jsonb,
  request_id text,
  ip_address inet,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_logs_entity_idx ON audit_logs (entity_type, entity_id, created_at DESC);
CREATE INDEX audit_logs_actor_idx ON audit_logs (actor_user_id, created_at DESC);

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER app_users_set_updated_at BEFORE UPDATE ON app_users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER meeting_rooms_set_updated_at BEFORE UPDATE ON meeting_rooms
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER meeting_requests_set_updated_at BEFORE UPDATE ON meeting_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER schedule_entries_set_updated_at BEFORE UPDATE ON schedule_entries
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
