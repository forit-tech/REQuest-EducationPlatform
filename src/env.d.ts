/// <reference types="vite/client" />

/**
 * Переменные QA-сборки.
 *
 * В публичной сборке их нет: Vite подставляет `undefined`, и проверочная
 * запись администратора в бандл не попадает.
 */
interface ImportMetaEnv {
  readonly VITE_ADMIN_BUILD?: string
  readonly VITE_ADMIN_VERIFIER?: string
  readonly VITE_BOT_ENDPOINT?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/** Версия из package.json, подставляется при сборке. */
declare const __APP_VERSION__: string
