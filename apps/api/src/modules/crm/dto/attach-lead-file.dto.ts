import { IsMongoId } from 'class-validator';

/** POST /leads/:leadId/files — уже загруженный и подтверждённый (purpose:'lead_attachment') MediaAsset. */
export class AttachLeadFileDto {
  @IsMongoId()
  assetId!: string;
}
