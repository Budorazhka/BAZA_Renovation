import { IsEmail, IsOptional, IsString, Length } from 'class-validator';

/**
 * teamApi.ts::assignOccupant(positionId, {name, email, loginEmail, phone?, telegram?}) —
 * email-based invite-flow (ИЗМЕНЕНО): фронтенд не знает identityId заранее,
 * резолвит по email — существующая Identity линкуется, для новой создаётся
 * pending_invite + Invitation с токеном.
 */
export class AssignOccupantDto {
  @IsString()
  @Length(1, 200)
  name!: string;

  @IsEmail()
  email!: string;

  /** teamApi.ts передаёт email и loginEmail раздельно, но оба описывают один и тот же логин — используется как normalizedLogin, email — только для Invitation.email (какой адрес показать в приглашении). */
  @IsEmail()
  loginEmail!: string;

  @IsOptional()
  @IsString()
  @Length(1, 40)
  phone?: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  telegram?: string;
}
