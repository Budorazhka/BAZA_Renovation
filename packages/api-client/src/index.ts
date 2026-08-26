import createClient from 'openapi-fetch';
import type { paths } from './schema';

export type { paths, components, operations } from './schema';

/**
 * conventions.md разд.7: единый generated client на все три frontend
 * приложения — ручные HTTP-вызовы для endpoint'ов, уже описанных в OpenAPI,
 * не допускаются. baseUrl передаётся вызывающим приложением (разные origin
 * для Marketplace/ERP/Admin, ADR-004), credentials:'include' обязателен —
 * host-only session cookie (ADR-004) должна уходить с каждым запросом.
 */
export function createApiClient(baseUrl: string) {
  return createClient<paths>({ baseUrl, credentials: 'include' });
}

export type ApiClient = ReturnType<typeof createApiClient>;
