import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsOptional, IsString, MaxLength, MinLength, ValidateNested } from 'class-validator';

export class DealChecklistItemInputDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  label!: string;

  @IsBoolean()
  done!: boolean;
}

export class UpdateDealChecklistDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DealChecklistItemInputDto)
  items!: DealChecklistItemInputDto[];
}
