import { IsInt, IsString, Min, MinLength } from 'class-validator';

/**
 * expectedVersion — CAS: клиент передаёт version, прочитанную вместе со
 * списком grants (GET /admin/accounts/:id/grants), не "текущую версию с
 * сервера" неявно — конфликт (409 VERSION_CONFLICT) означает, что список
 * на экране устарел относительно реального состояния.
 */
export class RevokePermissionGrantDto {
  @IsString()
  @MinLength(10)
  reason!: string;

  @IsInt()
  @Min(1)
  expectedVersion!: number;
}
