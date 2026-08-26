import { IsBoolean, IsMongoId, IsOptional } from 'class-validator';

export class CreateAdminAccountDto {
  @IsMongoId()
  identityId!: string;

  @IsOptional()
  @IsBoolean()
  isSuperAdmin?: boolean;
}
