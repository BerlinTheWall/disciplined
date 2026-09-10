/// <reference types="vite/client" />

// Injected by vite.config.ts `define` — the commit this bundle was built from,
// or "" when it could not be determined.
declare const __APP_RELEASE__: string;

interface ImportMetaEnv {
  /** Backend base URL. Defaults to http://127.0.0.1:8000 when unset. */
  readonly VITE_API_URL?: string;
  /** Sentry DSN. Unset disables error reporting entirely. */
  readonly VITE_SENTRY_DSN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
