import { IsOptional, IsString, Length } from 'class-validator';

export class VacatePositionDto {
  @IsOptional()
  @IsString()
  @Length(1, 500)
  handoverNote?: string;
}
