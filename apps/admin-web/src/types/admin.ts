export type PublicationSourceType = 'development' | 'unit' | 'listing'
export type PublicationStatus = 'publication_pending' | 'published' | 'unpublished' | 'build_failed'

export interface AdminPublicationListItem {
  id: string
  sourceType: string
  sourceId: string
  organizationId: string | null
  status: string
  slug: string | null
  publishedAt: string | null
  unpublishedAt: string | null
  unpublishReason: string | null
  city: string | null
}

export interface AdminPublicationList {
  items: AdminPublicationListItem[]
  nextCursor: string | null
}

export interface AdminPublicationListQuery {
  sourceType?: PublicationSourceType
  city?: string
  cursor?: string
  limit?: number
}

export interface UnpublishResult {
  id: string
  sourceType: string
  sourceId: string
  status: string
  slug: string | null
  unpublishReason: string | null
}

export interface AdminAccountListItem {
  id: string
  identityId: string
  isSuperAdmin: boolean
  status: 'active' | 'deactivated'
  createdAt: string
}

export interface AdminAccountList {
  items: AdminAccountListItem[]
  nextCursor: string | null
}

/** PermissionScope — см. apps/api PermissionGrantDocument.scope. */
export type PermissionScope =
  | 'own'
  | 'position'
  | 'team'
  | 'organization'
  | 'project'
  | 'city'
  | 'global'
  | 'assigned'
  | 'domain'

export interface PermissionGrant {
  id: string
  resource: string
  action: string
  scope: PermissionScope
  scopeValue?: string
  version: number
  revokedAt?: string
  revokedBy?: string
  revokeReason?: string
}

export interface DeactivateReactivateResult {
  status: 'active' | 'deactivated'
}

export interface PublicationReadScopeEntry {
  global: boolean
  cities: string[]
}

export interface AdminMe {
  adminAccountId: string
  isSuperAdmin: boolean
  publicationReadScope: 'all' | Partial<Record<PublicationSourceType, PublicationReadScopeEntry>>
}
