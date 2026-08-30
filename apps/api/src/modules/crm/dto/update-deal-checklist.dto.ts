import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsInt, IsOptional, IsString, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';

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
  @IsInt()
  @Min(0)
  expectedVersion!: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DealChecklistItemInputDto)
  items!: DealChecklistItemInputDto[];
}
