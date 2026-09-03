import type { LegacyApiEnvelope, RawLeadsPage, RawLegacyHistoryEntry } from './legacy-api-types';

/**
 * `[lead-legacy-export-tool]`: СТРОГО read-only HTTP-клиент к легаси-backend
 * (`api-crm.baza.sale`). Единственные вызовы сети в этом файле — `fetch(...,
 * { method: 'GET' })`. Ни одного POST/PATCH/PUT/DELETE — гарантия проверена
 * `export-legacy-leads.readonly-guard.spec.ts` (grep исходников на
 * мутирующие HTTP-методы).
 *
 * Retry с экспоненциальным backoff (300мс, 600мс, ...) на отдельный
 * неудачный запрос, потолок попыток `maxAttempts` (по умолчанию 3) — не
 * бесконечный, чтобы не зависнуть на постоянно недоступном сервере.
 */
export class LegacyApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'LegacyApiError';
  }
}

export interface LegacyApiClientOptions {
  baseUrl: string;
  token: string;
  maxAttempts?: number;
}

export interface LegacyApiClient {
  fetchLeadsPage(page: number, limit: number): Promise<RawLeadsPage>;
  fetchLeadHistory(leadId: string): Promise<RawLegacyHistoryEntry[]>;
}

export function createLegacyApiClient(options: LegacyApiClientOptions): LegacyApiClient {
  const { baseUrl, token, maxAttempts = 3 } = options;

  async function getJson<T>(path: string, query?: Record<string, string | number>): Promise<T> {
    const url = new URL(path, baseUrl);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        url.searchParams.set(key, String(value));
      }
    }

    return withRetry(async () => {
      const response = await fetch(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        throw new LegacyApiError(`GET ${url.pathname} → HTTP ${response.status}`, response.status);
      }
      const body = (await response.json()) as LegacyApiEnvelope<T>;
      if (body.success === false) {
        throw new LegacyApiError(body.message || `GET ${url.pathname} → success=false`);
      }
      if (body.data === undefined) {
        throw new LegacyApiError(`GET ${url.pathname} → ответ без поля data`);
      }
      return body.data;
    }, maxAttempts);
  }

  return {
    fetchLeadsPage(page: number, limit: number) {
      return getJson<RawLeadsPage>('/crm/leads', { page, limit });
    },
    fetchLeadHistory(leadId: string) {
      return getJson<RawLegacyHistoryEntry[]>(`/crm/leads/${encodeURIComponent(leadId)}/history`);
    },
  };
}

async function withRetry<T>(fn: () => Promise<T>, maxAttempts: number): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) {
        await sleep(300 * 2 ** (attempt - 1));
      }
    }
  }
  throw lastError;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
