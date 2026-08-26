import { IsArray, IsBoolean, IsInt, IsMongoId, IsNumber, IsOptional, IsString, Length, Min } from 'class-validator';

export class CreateFloorPlanDto {
  @IsString()
  @Length(1, 200)
  name!: string;

  @IsInt()
  @Min(0)
  rooms!: number;

  @IsNumber()
  @Min(0)
  area!: number;

  @IsOptional()
  @IsBoolean()
  isEuro?: boolean;

  @IsOptional()
  @IsMongoId()
  imageAssetId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}
