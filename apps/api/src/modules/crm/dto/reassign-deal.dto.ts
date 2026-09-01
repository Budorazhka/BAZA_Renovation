import { IsInt, IsMongoId, Min } from 'class-validator';

export class ReassignDealDto {
  @IsInt()
  @Min(0)
  expectedVersion!: number;

  @IsMongoId()
  ownerPositionId!: string;
}
