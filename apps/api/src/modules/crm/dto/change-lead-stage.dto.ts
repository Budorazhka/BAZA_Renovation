import { IsIn, IsInt, Min } from 'class-validator';
import { ALL_LEAD_STAGE_VALUES } from '../lead-stage';
import type { LeadStage } from '../schemas/lead.schema';

/**
 * expectedVersion — тот же optimistic concurrency паттерн, что
 * UpdateUnitStatusDto (developments-модуль): клиент присылает version,
 * прочитанную с последним GET /leads/:id, сервер атомарно проверяет её
 * актуальность в одном Mongo-фильтре (LeadRepository.changeStageWithVersionCheck).
 *
 * `@IsIn(ALL_LEAD_STAGE_VALUES)` — только coarse-проверка "это вообще
 * известная стадия хоть какого-то продукта" (ловит опечатки). Точная
 * проверка "stage принадлежит productType ЭТОГО лида" (или generic-пятёрке,
 * если у лида productType не задан) — CrmService.changeLeadStage, ей
 * недоступен productType лида на уровне DTO.
 */
export class ChangeLeadStageDto {
  @IsInt()
  @Min(0)
  expectedVersion!: number;

  @IsIn(ALL_LEAD_STAGE_VALUES)
  stage!: LeadStage;
}
