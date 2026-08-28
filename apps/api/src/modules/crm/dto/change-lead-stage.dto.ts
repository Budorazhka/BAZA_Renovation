import { IsIn, IsInt, Min } from 'class-validator';
import { LEAD_STAGES } from '../lead-stage';
import type { LeadStage } from '../schemas/lead.schema';

/**
 * expectedVersion — тот же optimistic concurrency паттерн, что
 * UpdateUnitStatusDto (developments-модуль): клиент присылает version,
 * прочитанную с последним GET /leads/:id, сервер атомарно проверяет её
 * актуальность в одном Mongo-фильтре (LeadRepository.changeStageWithVersionCheck).
 */
export class ChangeLeadStageDto {
  @IsInt()
  @Min(0)
  expectedVersion!: number;

  @IsIn(LEAD_STAGES)
  stage!: LeadStage;
}
