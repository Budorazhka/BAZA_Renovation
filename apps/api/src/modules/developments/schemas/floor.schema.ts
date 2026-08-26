import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/**
 * docs/architecture/domain-model.md Модуль 4 / mongodb-schema.md `floors`.
 */
@Schema({ collection: 'floors', timestamps: { createdAt: 'createdAt', updatedAt: false } })
export class FloorDocument extends Document {
  declare _id: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId })
  buildingId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: false })
  sectionId?: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId })
  organizationId!: Types.ObjectId;

  @Prop({ required: true })
  floorNumber!: number;

  @Prop()
  floorType?: string;

  declare createdAt: Date;
}

export const FloorSchema = SchemaFactory.createForClass(FloorDocument);

FloorSchema.index({ buildingId: 1, floorNumber: 1 });
FloorSchema.index({ sectionId: 1, floorNumber: 1 });
FloorSchema.index({ organizationId: 1 });
