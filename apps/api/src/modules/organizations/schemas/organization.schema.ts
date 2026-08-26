import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type OrganizationType = 'agency' | 'developer' | 'independent_realtor';
export type OrganizationStatus = 'active' | 'frozen' | 'archived';

/**
 * docs/architecture/domain-model.md Модуль 2 / mongodb-schema.md `organizations`.
 * Не содержит organizationId сама (корень tenant-границы, ADR-002).
 */
@Schema({ collection: 'organizations', timestamps: { createdAt: 'createdAt', updatedAt: false } })
export class OrganizationDocument extends Document {
  declare _id: Types.ObjectId;

  @Prop({ required: true, enum: ['agency', 'developer', 'independent_realtor'] })
  type!: OrganizationType;

  @Prop({ required: true })
  name!: string;

  @Prop({ required: true, enum: ['active', 'frozen', 'archived'], default: 'active' })
  status!: OrganizationStatus;

  declare createdAt: Date;
}

export const OrganizationSchema = SchemaFactory.createForClass(OrganizationDocument);
OrganizationSchema.index({ type: 1, status: 1 });
