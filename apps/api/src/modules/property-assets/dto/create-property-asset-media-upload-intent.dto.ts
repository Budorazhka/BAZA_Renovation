import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { MAX_UPLOAD_SIZE_BYTES } from '../../media/media.constants';

export class CreatePropertyAssetMediaUploadIntentDto {
  @IsString()
  @IsIn(['image/jpeg', 'image/png', 'image/webp'])
  declaredMimeType!: string;

  @IsInt()
  @Min(1)
  @Max(MAX_UPLOAD_SIZE_BYTES)
  sizeBytes!: number;

  @IsOptional()
  @IsString()
  purpose?: string;
}
