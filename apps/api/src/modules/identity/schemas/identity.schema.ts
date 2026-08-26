import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/**
 * pending_invite — ИСХОДНОЕ и ЕДИНСТВЕННОЕ временное состояние Identity,
 * созданной через assignOccupant-invite-flow ДО того, как приглашённый
 * поставил себе пароль (POST /invite/:token/activate). passwordHash
 * отсутствует в этом состоянии (ниже в схеме) — login() явно отклоняет
 * такую Identity (AUTH_INVALID_CREDENTIALS, не раскрывая, что аккаунт
 * "существует, но не активирован" — тот же non-disclosure принцип, что
 * везде в auth-модуле). activate() необратимо переводит в 'active'.
 */
export type IdentityStatus = 'active' | 'deactivated' | 'pending_invite';
export type TwoFactorMethod = 'none' | 'telegram_bot' | 'totp';

/**
 * docs/architecture/domain-model.md Модуль 1 / mongodb-schema.md `identities`.
 * Identity НЕ хранит текущую роль/организацию — только способ входа.
 */
@Schema({ collection: 'identities', timestamps: { createdAt: 'createdAt', updatedAt: false } })
export class IdentityDocument extends Document {
  declare _id: Types.ObjectId;

  @Prop({ required: true, unique: true })
  normalizedLogin!: string;

  /**
   * required:false (ИЗМЕНЕНО, invite-flow) — pending_invite Identity
   * создаётся assignOccupant-по-email БЕЗ пароля, приглашённый ставит его
   * сам через POST /invite/:token/activate. login() обязан проверять
   * наличие passwordHash явно (см. auth.service.ts) — argon2.verify(undefined,...)
   * не является безопасной заменой этой проверки.
   */
  @Prop({ select: false })
  passwordHash?: string;

  @Prop({ required: true, enum: ['active', 'deactivated', 'pending_invite'], default: 'active' })
  status!: IdentityStatus;

  @Prop({ required: true, enum: ['none', 'telegram_bot', 'totp'], default: 'none' })
  twoFactorMethod!: TwoFactorMethod;

  @Prop()
  deactivatedAt?: Date;

  declare createdAt: Date;
}

export const IdentitySchema = SchemaFactory.createForClass(IdentityDocument);
