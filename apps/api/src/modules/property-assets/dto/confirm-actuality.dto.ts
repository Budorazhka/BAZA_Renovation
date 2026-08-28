import { IsInt, Min } from 'class-validator';

/**
 * ACT-001: клиент передаёт ожидаемую version явно (conventions.md разд.5),
 * тот же паттерн, что UpdateUnitPriceDto/ChangeLeadStageDto.
 */
export class ConfirmActualityDto {
  @IsInt()
  @Min(0)
  expectedVersion!: number;
}
