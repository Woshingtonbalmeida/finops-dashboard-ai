/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PRODUCT_NAME?: string;
  readonly VITE_CLIENT_NAME?: string;
  readonly VITE_LOGO_PATH?: string;
  readonly VITE_LOGO_ALT?: string;
  readonly VITE_SUBSCRIPTION_LABELS?: string;
  readonly VITE_FUNCTION_APP_BASE_URL?: string;
  readonly VITE_DEMO?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
