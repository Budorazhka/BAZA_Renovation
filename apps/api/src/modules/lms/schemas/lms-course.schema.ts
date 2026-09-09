import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ _id: false })
export class FinalQuizQuestion {
  @Prop({ required: true, trim: true })
  question!: string;

  @Prop({ type: [String], required: true })
  options!: string[];

  @Prop({ required: true, type: Number })
  correct!: number;
}

@Schema({ _id: false })
export class CourseFinalQuiz {
  @Prop({ required: true, type: Number, default: 70 })
  passingScore!: number;

  @Prop({ type: [FinalQuizQuestion], required: true, default: [] })
  questions!: FinalQuizQuestion[];
}

@Schema({ collection: 'lms_courses', timestamps: true })
export class LmsCourseDocument extends Document {
  declare _id: Types.ObjectId;

  /**
   * Slug or string ID for the course (e.g. 'course-manager-base').
   */
  @Prop({ required: true, trim: true })
  courseId!: string;

  /**
   * Null/undefined for system-wide courses; ObjectId for tenant-created courses.
   */
  @Prop({ type: Types.ObjectId, required: false, default: null })
  organizationId?: Types.ObjectId | null;

  @Prop({ required: true, trim: true, maxlength: 300 })
  title!: string;

  @Prop({ required: true, trim: true, maxlength: 2000 })
  description!: string;

  @Prop({ type: [String], required: true, default: ['all'] })
  targetRoles!: string[];

  @Prop({ required: true, default: '🎯' })
  emoji!: string;

  /**
   * Ordered list of itemIds (references to LmsItemDocument.itemId).
   */
  @Prop({ type: [String], required: true, default: [] })
  itemIds!: string[];

  @Prop({ type: CourseFinalQuiz, required: false })
  finalQuiz?: CourseFinalQuiz;

  @Prop({ required: true, default: false })
  isSystem!: boolean;

  @Prop({ type: Types.ObjectId, required: false })
  createdByPositionId?: Types.ObjectId;
}

export const LmsCourseSchema = SchemaFactory.createForClass(LmsCourseDocument);

LmsCourseSchema.index({ organizationId: 1 });
LmsCourseSchema.index({ courseId: 1 });
