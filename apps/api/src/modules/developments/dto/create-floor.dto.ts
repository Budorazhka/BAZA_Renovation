import { IsInt, IsOptional, IsMongoId, IsString, Length } from 'class-validator';

export class CreateFloorDto {
  @IsInt()
  floorNumber!: number;

  @IsOptional()
  @IsMongoId()
  sectionId?: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  floorType?: string;
}
