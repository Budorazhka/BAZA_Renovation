import { IsString, MinLength } from 'class-validator';

/**
 * DEDUPE-001 owner override (xlsx #70: "Дубли мы не пропускаем. Если
 * риэлтор пишет Я ПОДТВЕРЖДАЮ ЧТО ЭТО НЕ ДУБЛЬ") — тот же reason-контракт,
 * что admin/unpublish-request.dto.ts и property-assets/unpublish-listing.dto.ts
 * (permission-matrix.md разд.4 duh: критическое действие требует reason).
 */
export class OverrideDuplicateDto {
  @IsString()
  @MinLength(10)
  reason!: string;
}
