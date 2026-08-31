import { IsInt, IsMongoId, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class AddDealParticipantDto {
  @IsInt()
  @Min(0)
  expectedVersion!: number;

  @IsMongoId()
  contactId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(50)
  role!: string;
}
