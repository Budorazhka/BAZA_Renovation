/**
 * Единая точка URL для бэкендов.
 *
 * В dev (`npm run dev`) по умолчанию всё идёт на localhost — см. `.env.development`.
 * Переменные можно переопределить в `.env` / `.env.local`.
 *
 * Production fallback — только если env не задан и это production-сборка.
 */

const PRODUCTION_CRM_ORIGIN = 'https://api-crm.baza.sale';
const PRODUCTION_BAZA_PUBLIC_ORIGIN = 'https://api.baza.sale';
// const PRODUCTION_MESSENGERS_ORIGIN = 'https://api-msngrs.baza.sale';
const PRODUCTION_MESSENGERS_ORIGIN = 'https://ai-erp.baza.sale';

const LOCAL_CRM_ORIGIN = 'http://localhost:3000';
const LOCAL_PLATFORM_ORIGIN = 'http://localhost:3000';
const LOCAL_MESSENGERS_ORIGIN = 'http://localhost:3001';

const warnedKeys = new Set<string>();
function warnOnce(key: string, message: string) {
  if (warnedKeys.has(key)) return;
  warnedKeys.add(key);
  if (typeof console !== 'undefined' && console.warn) console.warn(message);
}

/**
 * В production-сборке не даём уехать на localhost из .env — у пользователя там нет API.
 */
export function resolveBackendOrigin(
  rawFromEnv: string | undefined,
  productionFallback: string,
  logKey: string,
): string {
  const trimmed = rawFromEnv?.trim();
  const resolved = trimmed || productionFallback;
  if (import.meta.env.PROD && /localhost|127\.0\.0\.1/i.test(resolved)) {
    warnOnce(
      logKey,
      `[backend] В production задан локальный URL (${resolved}); используется: ${productionFallback}`,
    );
    return productionFallback;
  }
  return resolved;
}

function devOrProduction(localOrigin: string, productionOrigin: string): string {
  return import.meta.env.DEV ? localOrigin : productionOrigin;
}

function crmOriginFromEnv(): string | undefined {
  return import.meta.env.VITE_CRM_API_BASE_URL || import.meta.env.VITE_API_BASE_URL;
}

function platformOriginFromEnv(): string | undefined {
  return import.meta.env.VITE_PLATFORM_API_BASE_URL;
}

function bazaPublicOriginFromEnv(): string | undefined {
  return (
    import.meta.env.VITE_USER_FAVORITES_API_BASE_URL || import.meta.env.VITE_BAZA_PUBLIC_API_BASE_URL
  );
}

function messengersApiFromEnv(): string | undefined {
  return import.meta.env.VITE_API_URL_MSGR;
}

function messengersSocketFromEnv(): string | undefined {
  return import.meta.env.VITE_SOCKET_URL_MSGR;
}

/** REST CRM (axios `baseURL`) */
export const CRM_API_BASE_URL = resolveBackendOrigin(
  crmOriginFromEnv(),
  devOrProduction(LOCAL_CRM_ORIGIN, PRODUCTION_CRM_ORIGIN),
  'crm',
);

/**
 * Новый BAZA Platform API. Он не имеет fallback на legacy CRM: в production
 * адрес должен быть задан явно при деплое, иначе лиды рискуют уйти в старый
 * несовместимый backend.
 */
export const PLATFORM_API_BASE_URL = (() => {
  const origin = platformOriginFromEnv()?.trim();
  if (!origin) {
    if (import.meta.env.DEV) return LOCAL_PLATFORM_ORIGIN;
    throw new Error('[backend] VITE_PLATFORM_API_BASE_URL is required in production');
  }
  if (import.meta.env.PROD && /localhost|127\.0\.0\.1/i.test(origin)) {
    throw new Error('[backend] VITE_PLATFORM_API_BASE_URL must not point to localhost in production');
  }
  return origin;
})();

/** Messengers REST API */
export const MESSENGERS_API_URL = resolveBackendOrigin(
  messengersApiFromEnv(),
  devOrProduction(`${LOCAL_MESSENGERS_ORIGIN}/api`, `${PRODUCTION_MESSENGERS_ORIGIN}/api`),
  'messengersApi',
);

/** Messengers WebSocket */
export const MESSENGERS_SOCKET_URL = resolveBackendOrigin(
  messengersSocketFromEnv(),
  devOrProduction(LOCAL_MESSENGERS_ORIGIN, PRODUCTION_MESSENGERS_ORIGIN),
  'messengersSocket',
);

/**
 * Публичный API baza.sale (избранное, рефералы, объекты).
 * В dev по умолчанию — локальный CRM; если нужен прод, задайте VITE_USER_FAVORITES_API_BASE_URL.
 */
export const BAZA_PUBLIC_API_BASE_URL = resolveBackendOrigin(
  bazaPublicOriginFromEnv(),
  PRODUCTION_BAZA_PUBLIC_ORIGIN,
  'bazaPublic',
);

/** Socket.IO CRM-уведомлений */
export const SOCKET_ORIGIN = (() => {
  const fromWs = import.meta.env.VITE_WS_URL?.trim();
  if (fromWs) {
    return resolveBackendOrigin(fromWs, devOrProduction(LOCAL_CRM_ORIGIN, PRODUCTION_CRM_ORIGIN), 'ws');
  }
  return CRM_API_BASE_URL;
})();

if (import.meta.env.DEV && typeof console !== 'undefined') {
  console.info('[backend:dev]', {
    CRM_API_BASE_URL,
    PLATFORM_API_BASE_URL,
    MESSENGERS_API_URL,
    MESSENGERS_SOCKET_URL,
    BAZA_PUBLIC_API_BASE_URL,
    SOCKET_ORIGIN,
  });
}
