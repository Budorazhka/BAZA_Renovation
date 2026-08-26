import { IsString, IsOptional, Length, ValidateNested, IsDateString, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { DevelopmentLocationDto } from './development-location.dto';
import { DevelopmentContactDto } from './development-contact.dto';

export class UpdateDevelopmentDto {
  /** conventions.md разд.5: клиент передаёт ожидаемую version явно. */
  @IsInt()
  @Min(0)
  expectedVersion!: number;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  name?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => DevelopmentLocationDto)
  location?: DevelopmentLocationDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => DevelopmentContactDto)
  contact?: DevelopmentContactDto;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  classType?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  completionDate?: string;

  @IsOptional()
  @IsString()
  @Length(1, 5000)
  description?: string;
}
