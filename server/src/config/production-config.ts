const requiredProductionVariables = ['BOSS_WECOM_USER_ID', 'BOSS_APP_USER_ID', 'DATABASE_URL'] as const;

/** Tests and local skeleton work may omit credentials; production must never guess the boss identity. */
export function assertProductionConfiguration(env: NodeJS.ProcessEnv): void {
  if (env.NODE_ENV !== 'production') return;
  const missing = requiredProductionVariables.filter((name) => !env[name]?.trim());
  if (missing.length) {
    throw new Error(`Production configuration missing: ${missing.join(', ')}`);
  }
  if (env.WECOM_AUTH_ENABLED === 'true') {
    const oauthRequired = ['APP_BASE_URL', 'WECOM_CORP_ID', 'WECOM_APP_SECRET', 'WECOM_REDIRECT_URI'] as const;
    const oauthMissing = oauthRequired.filter((name) => !env[name]?.trim());
    if (oauthMissing.length) throw new Error(`WeCom OAuth configuration missing: ${oauthMissing.join(', ')}`);
  }
}
