import { IsString, MinLength } from 'class-validator';

/** AdminPolicyService.requireReason — min 10 символов, тот же порог, что unpublish. */
export class DeactivateAdminAccountDto {
  @IsString()
  @MinLength(10)
  reason!: string;
}
