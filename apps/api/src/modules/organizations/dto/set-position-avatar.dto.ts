import { IsMongoId } from 'class-validator';

export class SetPositionAvatarDto {
  @IsMongoId()
  assetId!: string;
}
