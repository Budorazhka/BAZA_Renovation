import { IsIn, IsInt, IsPositive, Max } from 'class-validator';
import { ALLOWED_MIME_TYPES, MAX_UPLOAD_SIZE_BYTES, MEDIA_PURPOSE_BUCKET } from '../media.constants';

export class CreateUploadIntentDto {
  @IsIn(Array.from(ALLOWED_MIME_TYPES))
  declaredMimeType!: string;

  @IsInt()
  @IsPositive()
  @Max(MAX_UPLOAD_SIZE_BYTES)
  sizeBytes!: number;

  @IsIn(Object.keys(MEDIA_PURPOSE_BUCKET))
  purpose!: string;
}
