import type { APIRequestContext } from '@playwright/test';
import { env, apiUrl } from './env';

/**
 * Thin wrappers over Playwright's own `request` APIRequestContext for
 * setup/verification calls made OUTSIDE the browser (real HTTP, real
 * cookies via the context's own cookie jar — no mocking). Each factory
 * takes an explicit `origin` because the API resolves product audience
 * from the `Origin` header (ADR-004, resolveProductAudienceFromOrigin) —
 * never from a client-sent field — so tests must set it explicitly to hit
 * the audience they intend to exercise, exactly like a real browser would
 * send it automatically for same-origin fetch/XHR calls.
 */

export interface AuthResult {
  identityId: string;
  requires2fa: boolean;
  status: number;
}

export function marketplaceApiClient(request: APIRequestContext) {
  const origin = env.marketplaceOrigin;

  return {
    async register(login: string, password: string) {
      const response = await request.post(apiUrl('/auth/register'), {
        headers: { Origin: origin },
        data: { login, password },
      });
      return { status: response.status(), body: await response.json().catch(() => undefined) };
    },

    async login(login: string, password: string): Promise<AuthResult & { body: unknown }> {
      const response = await request.post(apiUrl('/auth/login'), {
        headers: { Origin: origin },
        data: { login, password },
      });
      const body = await response.json().catch(() => undefined);
      return { status: response.status(), identityId: body?.identityId, requires2fa: body?.requires2fa, body };
    },

    async session() {
      const response = await request.get(apiUrl('/auth/session'), { headers: { Origin: origin } });
      return { status: response.status(), body: await response.json() };
    },

    async logout() {
      const response = await request.post(apiUrl('/auth/logout'), { headers: { Origin: origin } });
      return { status: response.status(), body: await response.json() };
    },
  };
}

export function adminApiClient(request: APIRequestContext) {
  const origin = env.adminOrigin;

  return {
    async login(login: string, password: string) {
      const response = await request.post(apiUrl('/auth/login'), {
        headers: { Origin: origin },
        data: { login, password },
      });
      const body = await response.json().catch(() => undefined);
      return { status: response.status(), body };
    },

    async logout() {
      const response = await request.post(apiUrl('/auth/logout'), { headers: { Origin: origin } });
      return { status: response.status(), body: await response.json() };
    },

    async me() {
      const response = await request.get(apiUrl('/admin/me'), { headers: { Origin: origin } });
      return { status: response.status(), body: await response.json().catch(() => undefined) };
    },

    async createAccount(params: { identityId: string; isSuperAdmin?: boolean }) {
      const response = await request.post(apiUrl('/admin/accounts'), {
        headers: { Origin: origin },
        data: params,
      });
      return { status: response.status(), body: await response.json().catch(() => undefined) };
    },

    async deactivateAccount(adminAccountId: string, reason: string) {
      const response = await request.post(apiUrl(`/admin/accounts/${adminAccountId}/deactivate`), {
        headers: { Origin: origin },
        data: { reason },
      });
      return { status: response.status(), body: await response.json().catch(() => undefined) };
    },

    async reactivateAccount(adminAccountId: string, reason: string) {
      const response = await request.post(apiUrl(`/admin/accounts/${adminAccountId}/reactivate`), {
        headers: { Origin: origin },
        data: { reason },
      });
      return { status: response.status(), body: await response.json().catch(() => undefined) };
    },

    async grantPermission(adminAccountId: string, params: { resource: string; action: string; scope: string; scopeValue?: string }) {
      const response = await request.post(apiUrl(`/admin/accounts/${adminAccountId}/grants`), {
        headers: { Origin: origin },
        data: params,
      });
      return { status: response.status(), body: await response.json().catch(() => undefined) };
    },

    async listGrants(adminAccountId: string) {
      const response = await request.get(apiUrl(`/admin/accounts/${adminAccountId}/grants`), { headers: { Origin: origin } });
      return { status: response.status(), body: await response.json().catch(() => undefined) };
    },

    async revokeGrant(adminAccountId: string, grantId: string, params: { expectedVersion: number; reason: string }) {
      const response = await request.post(apiUrl(`/admin/accounts/${adminAccountId}/grants/${grantId}/revoke`), {
        headers: { Origin: origin },
        data: params,
      });
      return { status: response.status(), body: await response.json().catch(() => undefined) };
    },

    async auditEvents(query: Record<string, string> = {}) {
      const search = new URLSearchParams(query).toString();
      const response = await request.get(apiUrl(`/admin/audit-events${search ? `?${search}` : ''}`), { headers: { Origin: origin } });
      return { status: response.status(), body: await response.json().catch(() => undefined) };
    },
  };
}
