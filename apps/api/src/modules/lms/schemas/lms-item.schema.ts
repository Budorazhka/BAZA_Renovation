import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type LmsContentType = 'article' | 'video' | 'script' | 'quiz' | 'presentation' | 'pdf';
export type LmsTargetRole = 'all' | 'manager' | 'rop' | 'director';

export const LMS_CONTENT_TYPES: readonly LmsContentType[] = [
  'article',
  'video',
  'script',
  'quiz',
  'presentation',
  'pdf',
] as const;

export const LMS_TARGET_ROLES: readonly LmsTargetRole[] = [
  'all',
  'manager',
  'rop',
  'director',
] as const;

@Schema({ collection: 'lms_items', timestamps: true })
export class LmsItemDocument extends Document {
  declare _id: Types.ObjectId;

  /**
   * Slug/Unique identifier for the item (e.g. 'art-crm-intro' or ObjectId string).
   */
  @Prop({ required: true, trim: true })
  itemId!: string;

  /**
   * Null/undefined for system-wide platform materials available to all tenants;
   * ObjectId for organization-specific custom materials.
   */
  @Prop({ type: Types.ObjectId, required: false, default: null })
  organizationId?: Types.ObjectId | null;

  @Prop({ required: true, type: String, enum: LMS_CONTENT_TYPES })
  type!: LmsContentType;

  @Prop({ required: true, trim: true, maxlength: 300 })
  title!: string;

  @Prop({ required: true, trim: true, maxlength: 2000 })
  description!: string;

  @Prop({ required: true, type: String, enum: LMS_TARGET_ROLES, default: 'all' })
  targetRole!: LmsTargetRole;

  @Prop({ required: false, trim: true })
  readTime?: string;

  @Prop({ type: [String], default: [] })
  tags!: string[];

  /**
   * Polymorphic content object:
   * article: { type: 'article', body: string }
   * video: { type: 'video', url: string, description?: string }
   * script: { type: 'script', lines: [{ speaker: 'manager'|'client', text: string }] }
   * quiz: { type: 'quiz', questions: [{ question: string, options: string[], correct: number }] }
   * presentation: { type: 'presentation', slides: [{ title: string, body: string }] }
   * pdf: { type: 'pdf', url: string, description?: string }
   */
  @Prop({ required: true, type: Object })
  content!: Record<string, unknown>;

  @Prop({ required: true, default: false })
  isSystem!: boolean;

  @Prop({ type: Types.ObjectId, required: false })
  createdByPositionId?: Types.ObjectId;
}

export const LmsItemSchema = SchemaFactory.createForClass(LmsItemDocument);

LmsItemSchema.index({ organizationId: 1, type: 1 });
LmsItemSchema.index({ itemId: 1 });
