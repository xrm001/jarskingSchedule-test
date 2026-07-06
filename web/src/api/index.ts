import { HttpApiClient } from './client'
import type { BossScheduleApi } from './client'
export const isMockMode = import.meta.env.VITE_DEMO_MODE === 'true'
  || (import.meta.env.DEV && import.meta.env.VITE_USE_MOCK === 'true')
export const api: BossScheduleApi = isMockMode
  ? (await import('./mock')).mockApi
  : new HttpApiClient(import.meta.env.VITE_API_BASE_URL || '/api')
