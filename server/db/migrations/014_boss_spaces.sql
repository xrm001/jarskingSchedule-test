DROP INDEX IF EXISTS exactly_one_active_boss_role_idx;

CREATE TABLE IF NOT EXISTS boss_spaces (
  id text PRIMARY KEY,
  boss_user_id uuid NOT NULL UNIQUE REFERENCES app_users(id),
  display_name text NOT NULL,
  short_name text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  enabled boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS one_default_boss_space_idx
  ON boss_spaces ((is_default))
  WHERE is_default;

INSERT INTO app_users (wecom_user_id, display_name, job_title, department, status, source)
VALUES ('jxMaoQingRong', '毛清蓉', '二老板', '总经办', 'ACTIVE', 'MANUAL')
ON CONFLICT (wecom_user_id) DO UPDATE
  SET display_name=EXCLUDED.display_name,
      job_title=EXCLUDED.job_title,
      department=EXCLUDED.department,
      status='ACTIVE',
      removed_at=NULL,
      updated_at=now();

INSERT INTO user_roles (user_id, role)
SELECT id, 'BOSS'::app_role FROM app_users WHERE wecom_user_id='jxMaoQingRong'
ON CONFLICT DO NOTHING;

DELETE FROM user_roles
WHERE role='BOSS_VIEWER'
  AND user_id=(SELECT id FROM app_users WHERE wecom_user_id='jxMaoQingRong' LIMIT 1);

INSERT INTO boss_spaces (id, boss_user_id, display_name, short_name, is_default, enabled, sort_order)
SELECT 'shi', id, '石总', '石', true, true, 10
FROM app_users
WHERE wecom_user_id='andyshi@jxpack'
ON CONFLICT (id) DO UPDATE
  SET boss_user_id=EXCLUDED.boss_user_id,
      display_name=EXCLUDED.display_name,
      short_name=EXCLUDED.short_name,
      is_default=EXCLUDED.is_default,
      enabled=EXCLUDED.enabled,
      sort_order=EXCLUDED.sort_order,
      updated_at=now();

INSERT INTO boss_spaces (id, boss_user_id, display_name, short_name, is_default, enabled, sort_order)
SELECT 'mao', id, '毛总', '毛', false, true, 20
FROM app_users
WHERE wecom_user_id='jxMaoQingRong'
ON CONFLICT (id) DO UPDATE
  SET boss_user_id=EXCLUDED.boss_user_id,
      display_name=EXCLUDED.display_name,
      short_name=EXCLUDED.short_name,
      is_default=EXCLUDED.is_default,
      enabled=EXCLUDED.enabled,
      sort_order=EXCLUDED.sort_order,
      updated_at=now();

INSERT INTO boss_status_history (boss_user_id, status, start_at, is_current)
SELECT boss_user_id, 'AVAILABLE', now(), true
FROM boss_spaces s
WHERE NOT EXISTS (
  SELECT 1 FROM boss_status_history h
  WHERE h.boss_user_id=s.boss_user_id AND h.is_current
);
