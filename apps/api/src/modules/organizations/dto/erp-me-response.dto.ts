import type { FixedRole } from '../schemas/position.schema';
import type { PermissionScope } from '../../authorization/schemas/permission-grant.schema';

export interface ErpMePermissionView {
  resource: string;
  action: string;
  scope: PermissionScope;
  scopeValue?: string;
}

export interface ErpMeResponseDto {
  identity: {
    id: string;
    login: string;
    status: string;
  };
  organization: {
    id: string;
    name: string;
    type: string;
    status: string;
  };
  position: {
    id: string;
    role: FixedRole;
    displayName: string;
    parentPositionId: string | null;
    avatarUrl?: string;
  };
  permissions: ErpMePermissionView[];
}
