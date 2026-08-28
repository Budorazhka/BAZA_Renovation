import { IsString, MinLength } from 'class-validator';

/**
 * MKT-002 owner-unpublish — тот же reason-контракт, что D-06
 * admin/dto/unpublish-request.dto.ts (permission-matrix.md разд.4: reason
 * обязателен для критических publication-действий, не только admin-side).
 */
export class UnpublishListingDto {
  @IsString()
  @MinLength(10)
  reason!: string;
}
