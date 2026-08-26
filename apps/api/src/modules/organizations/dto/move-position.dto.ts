import { IsMongoId, IsOptional } from 'class-validator';

export class MovePositionDto {
  @IsOptional()
  @IsMongoId()
  managerId?: string | null;
}
