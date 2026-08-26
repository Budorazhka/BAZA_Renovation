import { IsOptional, IsString, Length } from 'class-validator';

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
  utm?: Record<string, string>;
}
