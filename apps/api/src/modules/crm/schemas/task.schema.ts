import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type TaskStatus = 'open' | 'completed' | 'cancelled';

export const TASK_STATUSES: readonly TaskStatus[] = ['open', 'completed', 'cancelled'] as const;

/**
 * docs/architecture/domain-model.md Module 7 / mongodb-schema.md `tasks`.
 * CRM-003: Tasks / Next Action vertical slice.
 *
 * Tenant-scoped CRM task linked to a Lead and/or Contact.
 * Assigned to a Position inside the organization.
 */
@Schema({ collection: 'tasks', timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } })
export class TaskDocument extends Document {
  declare _id: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId })
  organizationId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  title!: string;

  @Prop({ required: false, trim: true })
  description?: string;

  @Prop({ required: true, enum: TASK_STATUSES, default: 'open' })
  status!: TaskStatus;

  @Prop({ required: false, type: Date })
  dueAt?: Date;

  @Prop({ type: Types.ObjectId, required: false })
  assignedPositionId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: false })
  leadId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: false })
  contactId?: Types.ObjectId;

  @Prop({ required: false, type: Date })
  completedAt?: Date;

  @Prop({ type: Types.ObjectId, required: false })
  completedByPositionId?: Types.ObjectId;

  declare createdAt: Date;
  declare updatedAt: Date;
}

export const TaskSchema = SchemaFactory.createForClass(TaskDocument);

// Compound indexes for pagination and filtered lookups
TaskSchema.index({ organizationId: 1, _id: -1 });
TaskSchema.index({ organizationId: 1, assignedPositionId: 1, status: 1 });
TaskSchema.index({ organizationId: 1, leadId: 1, status: 1 });
TaskSchema.index({ organizationId: 1, contactId: 1 });
TaskSchema.index({ organizationId: 1, dueAt: 1 });
TaskSchema.index({ organizationId: 1, status: 1 });
