import { randomUUID } from 'node:crypto';
import type { APIRequestContext } from '@playwright/test';
import { env, apiUrl } from './env';
import { registerIdentity } from './register';

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
      return registerIdentity(request, login, { password, origin });
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
        headers: { 'Idempotency-Key': randomUUID(), Origin: origin },
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

export function erpApiClient(request: APIRequestContext) {
  const origin = env.erpOrigin;

  return {
    async register(login: string, password: string) {
      return registerIdentity(request, login, { password, origin });
    },

    async login(login: string, password: string): Promise<AuthResult & { body: unknown }> {
      const response = await request.post(apiUrl('/auth/login'), {
        headers: { Origin: origin },
        data: { login, password },
      });
      const body = await response.json().catch(() => undefined);
      return { status: response.status(), identityId: body?.identityId, requires2fa: body?.requires2fa, body };
    },

    async registerOrganization(params: { login: string; password: string; name: string; type: string }) {
      const response = await request.post(apiUrl('/organizations/register'), {
        headers: { 'Idempotency-Key': randomUUID(), Origin: origin },
        data: params,
      });
      return { status: response.status(), body: await response.json().catch(() => undefined) };
    },

    async createDevelopment(data: Record<string, unknown>) {
      const response = await request.post(apiUrl('/developments'), {
        headers: { 'Idempotency-Key': randomUUID(), Origin: origin },
        data,
      });
      return { status: response.status(), body: await response.json().catch(() => undefined) };
    },

    async createBuilding(developmentId: string, data: Record<string, unknown>) {
      const response = await request.post(apiUrl(`/developments/${developmentId}/buildings`), {
        headers: { 'Idempotency-Key': randomUUID(), Origin: origin },
        data,
      });
      return { status: response.status(), body: await response.json().catch(() => undefined) };
    },

    async generateChessboard(buildingId: string, data: Record<string, unknown>) {
      // ИСПРАВЛЕНО 10.09.2026: было /developments/buildings/... — реальный
      // маршрут @Post('buildings/:buildingId/chessboard/generate') на
      // @Controller() без префикса, лишний /developments давал 404.
      const response = await request.post(apiUrl(`/buildings/${buildingId}/chessboard/generate`), {
        headers: { 'Idempotency-Key': randomUUID(), Origin: origin },
        data,
      });
      return { status: response.status(), body: await response.json().catch(() => undefined) };
    },

    async batchUpdatePrices(developmentId: string, data: Record<string, unknown>) {
      // ИСПРАВЛЕНО 10.09.2026: реальный путь — batch-price-update, не batch-prices.
      const response = await request.post(apiUrl(`/developments/${developmentId}/units/batch-price-update`), {
        headers: { 'Idempotency-Key': randomUUID(), Origin: origin },
        data,
      });
      return { status: response.status(), body: await response.json().catch(() => undefined) };
    },

    async publishDevelopment(developmentId: string) {
      const response = await request.post(apiUrl(`/developments/${developmentId}/publish`), {
        headers: { 'Idempotency-Key': randomUUID(), Origin: origin },
        data: {},
      });
      return { status: response.status(), body: await response.json().catch(() => undefined) };
    },

    async listUnits(buildingId: string) {
      // ИСПРАВЛЕНО 10.09.2026: маршрут @Get('buildings/:buildingId/units'), без /developments.
      const response = await request.get(apiUrl(`/buildings/${buildingId}/units?limit=50`), {
        headers: { Origin: origin },
      });
      return { status: response.status(), body: await response.json().catch(() => undefined) };
    },

    async listLeads() {
      const response = await request.get(apiUrl('/leads?limit=20'), {
        headers: { Origin: origin },
      });
      return { status: response.status(), body: await response.json().catch(() => undefined) };
    },

    async createBooking(data: Record<string, unknown>) {
      const response = await request.post(apiUrl('/bookings'), {
        headers: { 'Idempotency-Key': randomUUID(), Origin: origin },
        data,
      });
      return { status: response.status(), body: await response.json().catch(() => undefined) };
    },

    async convertBookingToDeal(bookingId: string, data: Record<string, unknown>) {
      const response = await request.post(apiUrl(`/bookings/${bookingId}/convert-to-deal`), {
        headers: { 'Idempotency-Key': randomUUID(), Origin: origin },
        data,
      });
      return { status: response.status(), body: await response.json().catch(() => undefined) };
    },
  };
}
