import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import type { PermissionScope } from '../../authorization/schemas/permission-grant.schema';

const PERMISSION_SCOPES: PermissionScope[] = [
  'own',
  'position',
  'team',
  'organization',
  'project',
  'city',
  'global',
  'assigned',
  'domain',
];

export class GrantPositionPermissionDto {
  @IsString()
  @MinLength(1)
  resource!: string;

  @IsString()
  @MinLength(1)
  action!: string;

  @IsIn(PERMISSION_SCOPES)
  scope!: PermissionScope;

  @IsOptional()
  @IsString()
  scopeValue?: string;
}
