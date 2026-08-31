import { IsDateString, IsMongoId, IsOptional } from 'class-validator';

export class CreateBookingDto {
  @IsMongoId()
  unitId!: string;

  @IsOptional()
  @IsMongoId()
  leadId?: string;

  @IsDateString()
  startsAt!: string;

  @IsDateString()
  expiresAt!: string;
}
