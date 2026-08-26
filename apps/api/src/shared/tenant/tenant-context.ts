/**
 * TenantContext — server-derived, никогда не принимается от клиента (ADR-002).
 * Строится TenantContextMiddleware из активной сессии + активного PositionAssignment,
 * не из body/query/path-параметра запроса.
 */
export interface TenantContext {
  readonly organizationId: string;
  readonly positionId: string;
  readonly identityId: string;
}

/**
 * Branded type: значение этого типа гарантированно прошло через
 * TenantContextMiddleware, а не собрано вручную в коде модуля.
 * Repository-методы принимают только TenantContext, никогда "просто organizationId".
 */
export type VerifiedTenantContext = TenantContext & { readonly __verified: true };
