import { Type } from 'class-transformer';
import { IsOptional, IsString, Length, ValidateNested } from 'class-validator';

/**
 * Security review 31.08.2026: `utm?: Record<string, string>` без формы —
 * whitelist/forbidNonWhitelisted (global ValidationPipe) отсекают лишние
 * ПОЛЯ ВЕРХНЕГО УРОВНЯ DTO, но ничего не знают о содержимом объекта без
 * decorator'ов (class-validator не валидирует "просто Record"). Публичный
 * гость (reveal-contact — БЕЗ сессии, только rate limit) мог сохранить в
 * Lead.source.utm произвольный объект любого размера/вложенности — не
 * только "мусорные" ключи сверх стандартных utm_*, но и потенциально
 * огромный документ (storage abuse) без единой проверки размера. Пять
 * стандартных ключей UTM (source/medium/campaign/term/content) — тот же
 * whitelist-принцип, что уже применяется к самому DTO, просто на один
 * уровень глубже; `@ValidateNested()+@Type()` заставляет class-validator
 * применить whitelist РЕКУРСИВНО и к вложенному объекту (не только к
 * requesterName/requesterPhone), а не разрешить произвольную форму.
 */
export class UtmDto {
  @IsOptional()
  @IsString()
  @Length(1, 200)
  utm_source?: string;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  utm_medium?: string;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  utm_campaign?: string;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  utm_term?: string;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  utm_content?: string;
}

/**
 * docs/api/v1-first-vertical-slice.yaml RevealContactRequest — оба поля
 * опциональны по контракту, но CrmService.revealContact требует
 * requesterPhone фактически (без него невозможно создать/найти Contact,
 * см. комментарий в crm.service.ts::resolveContact).
 */
export class RevealContactDto {
  @IsOptional()
  @IsString()
  @Length(1, 200)
  requesterName?: string;

  @IsOptional()
  @IsString()
  @Length(1, 30)
  requesterPhone?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => UtmDto)
  utm?: UtmDto;
}

/**
 * CrmService/LeadDocument.source.utm хранят плоский `Record<string, string>`
 * (persistence-слою достаточно строкового словаря, ему не нужна фиксированная
 * форма — источник whitelist'а уже DTO-валидация выше) — этот helper
 * конвертирует уже провалидированный `UtmDto` в тот же плоский вид на
 * границе контроллера, отбрасывая незаполненные поля.
 */
export function toUtmRecord(utm: UtmDto | undefined): Record<string, string> | undefined {
  if (!utm) return undefined;
  const entries = Object.entries(utm).filter((entry): entry is [string, string] => entry[1] !== undefined);
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}
