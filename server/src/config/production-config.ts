const requiredProductionVariables = ['BOSS_WECOM_USER_ID', 'BOSS_APP_USER_ID'] as const;

/** Tests and local skeleton work may omit credentials; production must never guess the boss identity. */
export function assertProductionConfiguration(env: NodeJS.ProcessEnv): void {
  if (env.NODE_ENV !== 'production') return;
  const missing = requiredProductionVariables.filter((name) => !env[name]?.trim());
  if (missing.length) {
    throw new Error(`Production configuration missing: ${missing.join(', ')}`);
  }
}
