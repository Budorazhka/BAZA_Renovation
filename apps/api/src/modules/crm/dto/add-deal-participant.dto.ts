import { IsMongoId, IsString, MaxLength, MinLength } from 'class-validator';

export class AddDealParticipantDto {
  @IsMongoId()
  contactId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(50)
  role!: string;
}
