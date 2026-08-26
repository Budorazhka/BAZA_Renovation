import { IsString, IsOptional, Length, ValidateNested, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';
import { DevelopmentLocationDto } from './development-location.dto';
import { DevelopmentContactDto } from './development-contact.dto';

export class CreateDevelopmentDto {
  @IsString()
  @Length(1, 200)
  name!: string;

  @ValidateNested()
  @Type(() => DevelopmentLocationDto)
  location!: DevelopmentLocationDto;

  @ValidateNested()
  @Type(() => DevelopmentContactDto)
  contact!: DevelopmentContactDto;

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
