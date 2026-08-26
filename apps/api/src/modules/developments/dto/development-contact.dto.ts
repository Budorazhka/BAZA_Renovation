import { IsString, IsOptional, Length } from 'class-validator';

/**
 * D-05 (docs/architecture/domain-model.md Модуль 4 "contact добавлено
 * 25.08.2026"): контакт для reveal-contact, указывается застройщиком при
 * создании ЖК. phone обязателен (единственный гарантированный канал).
 */
export class DevelopmentContactDto {
  @IsString()
  @Length(1, 30)
  phone!: string;

  @IsOptional()
  @IsString()
  @Length(1, 30)
  whatsapp?: string;

  @IsOptional()
  @IsString()
  @Length(1, 60)
  telegram?: string;
}
