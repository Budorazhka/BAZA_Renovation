import { IsString, IsOptional, ValidateNested, Length } from 'class-validator';
import { Type } from 'class-transformer';
import { GeoPointDto } from './geo-point.dto';

export class DevelopmentLocationDto {
  @IsString()
  @Length(1, 100)
  country!: string;

  @IsString()
  @Length(1, 100)
  city!: string;

  @IsOptional()
  @IsString()
  @Length(1, 300)
  address?: string;

  @ValidateNested()
  @Type(() => GeoPointDto)
  geo!: GeoPointDto;
}
