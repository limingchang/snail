/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_APP_CAPTCHA_ID: string;
  // 更多环境变量...
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}