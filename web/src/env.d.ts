/// <reference types="vite/client" />

interface Window {
  wx?: {
    config(options:Record<string,unknown>):void;
    agentConfig?(options:Record<string,unknown>):void;
    ready(callback:()=>void):void;
    error(callback:(error:unknown)=>void):void;
    startRecord(options:Record<string,unknown>):void;
    stopRecord(options:Record<string,unknown>):void;
    translateVoice(options:Record<string,unknown>):void;
  };
}

interface ImportMetaEnv {
  readonly VITE_USE_MOCK?: string
  readonly VITE_DEMO_MODE?: string
  readonly VITE_API_BASE_URL?: string
  readonly VITE_AUTO_LOGIN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
