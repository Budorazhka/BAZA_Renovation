import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ContactRole = 'buyer' | 'investor' | 'owner' | 'referral' | 'broker';

/**
 * docs/architecture/domain-model.md Модуль 7 / mongodb-schema.md `contacts`.
 * Invariant: tenant-local dedupe по phone — ТОЛЬКО внутри организации,
 * cross-tenant существование не раскрывается (owner decision, master
 * plan: "Дубль лида ищется только внутри одной организации").
 */
@Schema({ collection: 'contacts', timestamps: { createdAt: 'createdAt', updatedAt: false } })
export class ContactDocument extends Document {
  declare _id: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId })
  organizationId!: Types.ObjectId;

  @Prop({ required: true })
  name!: string;

  @Prop({ required: true })
  phone!: string;

  @Prop()
  email?: string;

  @Prop({ type: [String], default: [] })
  roles!: ContactRole[];

  declare createdAt: Date;
}

export const ContactSchema = SchemaFactory.createForClass(ContactDocument);

ContactSchema.index({ organizationId: 1, phone: 1 });
