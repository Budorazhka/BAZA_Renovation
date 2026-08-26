import { SetMetadata } from '@nestjs/common';

export const PERMISSION_METADATA_KEY = 'baza:required-permission';

export interface RequiredPermission {
  resource: string;
  action: string;
}

/**
 * Декоратор на controller-методе — permission-matrix.md формат
 * resource.action.scope (scope здесь не указывается статически, он
 * определяется динамически из TenantContext.organizationId для ERP или
 * AdminContext scope для Admin — см. PermissionGuard).
 *
 * Пример: @RequirePermission('unit', 'price.update')
 */
export function RequirePermission(resource: string, action: string): MethodDecorator {
  return SetMetadata(PERMISSION_METADATA_KEY, { resource, action } satisfies RequiredPermission);
}
