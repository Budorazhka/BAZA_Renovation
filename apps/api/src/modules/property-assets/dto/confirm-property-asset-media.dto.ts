import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class ConfirmPropertyAssetMediaDto {
  @IsOptional()
  @IsString()
  @IsIn(['cover', 'gallery'])
  role?: 'cover' | 'gallery';

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsString()
  alt?: string;

  @IsOptional()
  @IsBoolean()
  isPrivate?: boolean;
}
