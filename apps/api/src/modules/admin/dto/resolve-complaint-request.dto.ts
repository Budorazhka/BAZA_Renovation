import { IsIn, IsString, MinLength } from 'class-validator';

/**
 * permission-matrix.md разд.4: обязательный reason для Admin critical
 * action — тот же контракт, что UnpublishRequestDto/ConfirmDuplicateRequestDto.
 * `decision` — explicit upheld/dismissed, не булев флаг: master plan разд.6.3
 * domain invariant ("подача жалобы не означает нарушение") требует, чтобы
 * ТОЛЬКО это явное admin-решение переводило жалобу в тот или иной resolved-статус.
 */
export class ResolveComplaintRequestDto {
  @IsIn(['upheld', 'dismissed'])
  decision!: 'upheld' | 'dismissed';

  @IsString()
  @MinLength(10)
  reason!: string;
}
