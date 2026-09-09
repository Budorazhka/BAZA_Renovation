import { IsString, MinLength } from 'class-validator';

export class FreezeOrganizationRequestDto {
  @IsString()
  @MinLength(10)
  reason!: string;
}
