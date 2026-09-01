import { IsString, MinLength } from 'class-validator';

/**
 * permission-matrix.md разд.4: обязательный reason для Admin critical
 * action — тот же контракт, что UnpublishRequestDto.
 */
export class ConfirmDuplicateRequestDto {
  @IsString()
  @MinLength(10)
  reason!: string;
}
