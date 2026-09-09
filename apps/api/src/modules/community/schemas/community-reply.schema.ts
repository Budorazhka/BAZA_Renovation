import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import type { AuthorSnapshot } from './community-thread.schema';

@Schema({ collection: 'community_replies', timestamps: true })
export class CommunityReplyDocument extends Document {
  @Prop({ required: true, unique: true, index: true })
  replyId!: string;

  @Prop({ required: true, index: true })
  threadId!: string;

  @Prop({ required: true, type: Types.ObjectId, index: true })
  authorIdentityId!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, index: true })
  authorPositionId!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, index: true })
  organizationId!: Types.ObjectId;

  @Prop({ type: Object, required: true })
  authorSnapshot!: AuthorSnapshot;

  @Prop({ required: true })
  body!: string;

  @Prop({ default: 0 })
  reactions!: number;

  @Prop({ type: [String], default: [] })
  reactionUserIds!: string[];

  @Prop({ default: false })
  isBest!: boolean;

  createdAt!: Date;
  updatedAt!: Date;
}

export const CommunityReplySchema = SchemaFactory.createForClass(CommunityReplyDocument);
CommunityReplySchema.index({ threadId: 1, isBest: -1, createdAt: 1 });
