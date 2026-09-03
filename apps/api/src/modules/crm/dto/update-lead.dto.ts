import { ArrayMaxSize, IsArray, IsIn, IsNumber, IsOptional, IsString, Length, Min } from 'class-validator';
import { ALL_LEAD_STAGE_VALUES } from '../lead-stage';
import type { LeadStage } from '../schemas/lead.schema';

/**
 * PATCH /leads/:leadId — сопутствующие поля лида (см. lead.schema.ts
 * докстринг блока полей ниже `version`). НЕ содержит `stage` — смена
 * стадии остаётся только за `PATCH /leads/:leadId/stage`
 * (CAS/idempotency), этот DTO её не принимает вовсе.
 *
 * `realtorStage`/`curatorStage` — `@IsIn(ALL_LEAD_STAGE_VALUES)` та же
 * coarse-проверка, что `ChangeLeadStageDto.stage` ("это вообще известная
 * стадия хоть какого-то продукта"). Точная проверка "стадия принадлежит
 * productType этого лида" — CrmService.updateLead, ей недоступен
 * productType лида на уровне DTO.
 */
export class UpdateLeadDto {
  @IsOptional()
  @IsString()
  @Length(1, 200)
  city?: string;

  @IsOptional()
  @IsString()
  @Length(0, 5000)
  notes?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  dealValue?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  budgetValue?: number;

  @IsOptional()
  @IsString()
  @Length(1, 10)
  budgetCurrency?: string;

  @IsOptional()
  @IsString()
  @Length(1, 40)
  expectedCloseDate?: string;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  rejectionReason?: string;

  @IsOptional()
  @IsString()
  @Length(0, 2000)
  rejectionComment?: string;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  telegram?: string;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  country?: string;

  @IsOptional()
  @IsIn(ALL_LEAD_STAGE_VALUES)
  realtorStage?: LeadStage;

  @IsOptional()
  @IsIn(ALL_LEAD_STAGE_VALUES)
  curatorStage?: LeadStage;

  // `expectedVersion`/`stage` намеренно нет в этом DTO: сопутствующие поля
  // не версионированы (см. LeadRepository.updateFields докстринг) — только
  // сам `stage` защищён optimistic concurrency через отдельный эндпоинт
  // PATCH /leads/:leadId/stage.
}
