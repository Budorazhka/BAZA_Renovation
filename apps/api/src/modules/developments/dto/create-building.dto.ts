import { IsString, IsOptional, Length, IsInt, Min, IsDateString } from 'class-validator';

export class CreateBuildingDto {
  @IsString()
  @Length(1, 200)
  name!: string;

  @IsInt()
  @Min(1)
  floorsCount!: number;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  completionDate?: string;
}
