import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type InvitationStatus = 'pending' | 'activated' | 'expired';

/**
 * docs/architecture/domain-model.md Модуль 2 `Invitation` / assignOccupant-
 * invite-flow. token хранится хешированным (та же причина, что sessionToken
 * в SessionDocument — сырой токен живёт только в ссылке /invite/:token,
 * утечка БД не даёт готовый рабочий токен). organizationId денормализован
 * с Position (domain-model.md явно фиксирует это решение от 25.08.2026,
 * ADR-002 требует явный organizationId на каждом tenant-scoped документе).
 */
@Schema({ collection: 'invitations', timestamps: { createdAt: 'createdAt', updatedAt: false } })
export class InvitationDocument extends Document {
  declare _id: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'OrganizationDocument', index: true })
  organizationId!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'PositionDocument' })
  positionId!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'IdentityDocument' })
  identityId!: Types.ObjectId;

  /** SHA-256 сырого токена — не argon2 (это lookup key, не пароль: одна попытка сравнения, не защита от brute-force одного значения). */
  @Prop({ required: true, unique: true, select: false })
  tokenHash!: string;

  @Prop({ required: true })
  email!: string;

  @Prop({ required: true, enum: ['pending', 'activated', 'expired'], default: 'pending' })
  status!: InvitationStatus;

  @Prop({ required: true })
  expiresAt!: Date;

  declare createdAt: Date;
}

export const InvitationSchema = SchemaFactory.createForClass(InvitationDocument);

InvitationSchema.index({ positionId: 1, status: 1 });
