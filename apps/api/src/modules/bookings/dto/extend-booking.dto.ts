import { IsDateString } from 'class-validator';

export class ExtendBookingDto {
  @IsDateString()
  newExpiresAt!: string;
}
