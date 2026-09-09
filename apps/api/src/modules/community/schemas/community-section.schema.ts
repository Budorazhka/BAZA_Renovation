import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type SectionKind = 'feed' | 'category' | 'exchange' | 'showcase' | 'events';

@Schema({ collection: 'community_sections', timestamps: true })
export class CommunitySectionDocument extends Document {
  @Prop({ required: true, unique: true, index: true })
  sectionId!: string;

  @Prop({ required: true })
  name!: string;

  @Prop({ required: true, enum: ['feed', 'category', 'exchange', 'showcase', 'events'] })
  kind!: SectionKind;

  @Prop({ type: String, default: null })
  group?: string | null;

  @Prop({ required: true })
  icon!: string;

  @Prop({ required: true })
  description!: string;

  @Prop({ default: 0 })
  threadCount!: number;

  @Prop({ default: 0 })
  order!: number;
}

export const CommunitySectionSchema = SchemaFactory.createForClass(CommunitySectionDocument);
