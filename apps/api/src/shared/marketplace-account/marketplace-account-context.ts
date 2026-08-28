/**
 * MarketplaceAccountContext — третий независимый auth-контур (ADR-002
 * требование 6 распространён с ERP/Admin на marketplace): физически
 * отдельный от TenantContext/AdminContext, даже несмотря на то, что все
 * три технически несут identityId — разные authorization-контуры не
 * должны смешиваться в одном коде (тот же принцип, что AdminContext
 * докстринг явно фиксирует для пары ERP/Admin).
 *
 * Отличие от TenantContext: нет organizationId/positionId вообще —
 * marketplace-аккаунт НЕ требует Organization/Position (AuthService.login()
 * уже документирует: "marketplace НЕ требует ProductAccess... базовый
 * доступ любой активной Identity"). Repository-методы для marketplace-
 * владения PropertyAsset/Listing принимают только identityId отсюда,
 * никогда TenantContext.organizationId.
 */
export interface MarketplaceAccountContext {
  readonly identityId: string;
}

export type VerifiedMarketplaceAccountContext = MarketplaceAccountContext & { readonly __verifiedMarketplaceAccount: true };
