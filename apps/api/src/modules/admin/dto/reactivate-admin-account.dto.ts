import { IsString, MinLength } from 'class-validator';

/** Симметрично DeactivateAdminAccountDto — reason обязателен и для восстановления доступа, для одинаковой audit-полноты обеих операций. */
export class ReactivateAdminAccountDto {
  @IsString()
  @MinLength(10)
  reason!: string;
}
