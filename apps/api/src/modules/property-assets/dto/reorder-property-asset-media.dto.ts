import { Type } from 'class-transformer';
import { IsArray, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

export class PropertyAssetMediaOrderItemDto {
  @IsString()
  @IsNotEmpty()
  mediaAssetId!: string;

  @IsInt()
  @Min(0)
  sortOrder!: number;

  @IsOptional()
  @IsString()
  @IsIn(['cover', 'gallery'])
  role?: 'cover' | 'gallery';
}

export class ReorderPropertyAssetMediaDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PropertyAssetMediaOrderItemDto)
  items!: PropertyAssetMediaOrderItemDto[];
}
