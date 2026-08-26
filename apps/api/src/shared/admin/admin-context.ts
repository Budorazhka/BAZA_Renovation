/**
 * AdminContext — физически отдельный от TenantContext (ADR-002 требование 6,
 * ADR-009). Admin-repository-методы принимают AdminContext, никогда
 * TenantContext, даже если оба технически содержат identityId — это разные
 * authorization-контуры, не должны смешиваться в одном коде.
 */
export interface AdminContext {
  readonly identityId: string;
  readonly adminAccountId: string;
  readonly isSuperAdmin: boolean;
}

export type VerifiedAdminContext = AdminContext & { readonly __verifiedAdmin: true };
