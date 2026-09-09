import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/**
 * docs/architecture/domain-model.md Модуль 4 / mongodb-schema.md `sections`.
 * Опциональное расширение конкретного корпуса — Unit может ссылаться
 * напрямую на Building без Section, если секций у корпуса нет.
 */
@Schema({ collection: 'sections', timestamps: { createdAt: 'createdAt', updatedAt: false } })
export class SectionDocument extends Document {
  declare _id: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId })
  buildingId!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId })
  organizationId!: Types.ObjectId;

  @Prop({ required: true })
  name!: string;

  declare createdAt: Date;
}

export const SectionSchema = SchemaFactory.createForClass(SectionDocument);

SectionSchema.index({ buildingId: 1 });
SectionSchema.index({ organizationId: 1 });
