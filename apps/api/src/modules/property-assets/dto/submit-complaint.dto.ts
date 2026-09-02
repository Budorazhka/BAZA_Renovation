import { IsEmail, IsIn, IsOptional, IsString, Length } from 'class-validator';

const CATEGORIES = ['not_available', 'wrong_info', 'scam', 'duplicate', 'other'] as const;

/**
 * Публичный, анонимный (без сессии) — все reporter*-поля опциональны, тот
 * же принцип, что RevealContactDto (crm/dto/reveal-contact.dto.ts). Жалоба
 * сама по себе НЕ является доказательством нарушения (master plan разд.6.3),
 * поэтому `details` не требует `@MinLength` — минимальная длина reason
 * обязательна только для admin-резолюции (ResolveComplaintRequestDto), не
 * для самой подачи.
 */
export class SubmitComplaintDto {
  @IsIn(CATEGORIES)
  category!: (typeof CATEGORIES)[number];

  @IsOptional()
  @IsString()
  @Length(1, 2000)
  details?: string;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  reporterName?: string;

  @IsOptional()
  @IsString()
  @Length(1, 30)
  reporterPhone?: string;

  @IsOptional()
  @IsEmail()
  reporterEmail?: string;
}
