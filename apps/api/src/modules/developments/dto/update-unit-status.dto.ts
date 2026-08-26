import { IsIn, IsInt, Min } from 'class-validator';

const UNIT_STATUSES = ['available', 'reserved', 'sold', 'hidden'] as const;

export class UpdateUnitStatusDto {
  @IsInt()
  @Min(0)
  expectedVersion!: number;

  @IsIn(UNIT_STATUSES)
  status!: (typeof UNIT_STATUSES)[number];
}
