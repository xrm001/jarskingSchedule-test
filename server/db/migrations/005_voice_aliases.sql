CREATE TYPE user_alias_type AS ENUM ('BOSS_NICKNAME', 'ENGLISH_NAME', 'PRONUNCIATION', 'LEARNED');

CREATE TABLE user_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  alias text NOT NULL CHECK (length(btrim(alias)) > 0),
  normalized_alias text NOT NULL CHECK (length(btrim(normalized_alias)) > 0),
  alias_type user_alias_type NOT NULL DEFAULT 'BOSS_NICKNAME',
  pinyin text,
  priority integer NOT NULL DEFAULT 100,
  enabled boolean NOT NULL DEFAULT true,
  source text NOT NULL DEFAULT 'EXCEL' CHECK (source IN ('EXCEL','ADMIN','VOICE_CONFIRMATION')),
  confirmed_count integer NOT NULL DEFAULT 0 CHECK (confirmed_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, normalized_alias)
);

CREATE INDEX user_aliases_normalized_idx ON user_aliases (normalized_alias) WHERE enabled;
CREATE INDEX user_aliases_user_idx ON user_aliases (user_id) WHERE enabled;

ALTER TABLE voice_commands
  RENAME COLUMN transcript TO raw_transcript;

ALTER TABLE voice_commands
  ADD COLUMN corrected_transcript text,
  ADD COLUMN corrections jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN suspected_names jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN candidate_matches jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN asr_provider text,
  ADD COLUMN ai_provider text,
  ADD COLUMN ai_model text,
  ADD COLUMN provider_request_id text,
  ADD COLUMN expires_at timestamptz;

CREATE TRIGGER user_aliases_set_updated_at BEFORE UPDATE ON user_aliases
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
