import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ProductAudience = 'marketplace' | 'erp' | 'admin';

/**
 * docs/architecture/domain-model.md Модуль 1 / mongodb-schema.md `sessions`.
 * ADR-004: единая коллекция на все три продукта, разведённых по productAudience.
 * Хранит ТОЛЬКО tokenHash — не сам токен (master plan разд.11).
 */
@Schema({ collection: 'sessions', timestamps: { createdAt: 'createdAt', updatedAt: false } })
export class SessionDocument extends Document {
  declare _id: Types.ObjectId;

  // Без index:true — компаунд-индекс {identityId,productAudience,revokedAt}
  // ниже уже обслуживает запросы по identityId через MongoDB index prefix.
  @Prop({ required: true, type: Types.ObjectId, ref: 'IdentityDocument' })
  identityId!: Types.ObjectId;

  @Prop({ required: true, enum: ['marketplace', 'erp', 'admin'], index: true })
  productAudience!: ProductAudience;

  @Prop({ required: true, unique: true })
  tokenHash!: string;

  @Prop({ required: true, index: { expires: 0 } })
  expiresAt!: Date;

  @Prop()
  revokedAt?: Date;

  @Prop()
  ipAddress?: string;

  @Prop()
  userAgent?: string;

  declare createdAt: Date;
}

export const SessionSchema = SchemaFactory.createForClass(SessionDocument);

// mongodb-schema.md: {identityId: 1, productAudience: 1, revokedAt: 1} —
// обслуживает "отозвать все ERP-сессии этого identity" (vacatePosition).
SessionSchema.index({ identityId: 1, productAudience: 1, revokedAt: 1 });
