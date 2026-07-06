/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_USE_MOCK?: string
  readonly VITE_DEMO_MODE?: string
  readonly VITE_API_BASE_URL?: string
  readonly VITE_AUTO_LOGIN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
