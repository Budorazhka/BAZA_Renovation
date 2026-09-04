import { ArrayMinSize, IsArray, IsInt, IsMongoId, Min } from 'class-validator';

export class AddSelectionItemsDto {
  @IsInt()
  @Min(0)
  expectedVersion!: number;

  @IsArray()
  @ArrayMinSize(1)
  @IsMongoId({ each: true })
  unitIds!: string[];
}
