CREATE TABLE oauth_states (
  state_hash bytea PRIMARY KEY,
  return_path text NOT NULL DEFAULT '/' CHECK (return_path LIKE '/%'),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX oauth_states_expiry_idx ON oauth_states (expires_at) WHERE consumed_at IS NULL;

CREATE TABLE auth_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  token_hash bytea NOT NULL UNIQUE,
  csrf_hash bytea NOT NULL,
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX auth_sessions_active_idx ON auth_sessions (expires_at)
  WHERE revoked_at IS NULL;
