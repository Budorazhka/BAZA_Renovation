import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ThreadType = 'discussion' | 'question' | 'announcement' | 'exchange' | 'showcase';
export type ExchangeIntent =
  | 'rent_seek'
  | 'buy_seek'
  | 'partner_seek'
  | 'client_handover'
  | 'rent_offer'
  | 'sale_offer'
  | 'service_offer';
export type ExchangeSide = 'demand' | 'supply';
export type ExchangeStatus = 'open' | 'in_work' | 'closed';

export interface AuthorSnapshot {
  name: string;
  segment?: string;
  role?: string;
  company?: string;
  city?: string;
  badges?: string[];
}

export interface ExchangeMeta {
  intent: ExchangeIntent;
  side: ExchangeSide;
  dealKind: string;
  location: string;
  amount: string;
  commission?: string;
  deadline?: string;
  status: ExchangeStatus;
}

@Schema({ collection: 'community_threads', timestamps: true })
export class CommunityThreadDocument extends Document {
  @Prop({ required: true, unique: true, index: true })
  threadId!: string;

  @Prop({ required: true, enum: ['discussion', 'question', 'announcement', 'exchange', 'showcase'] })
  type!: ThreadType;

  @Prop({ required: true, index: true })
  sectionId!: string;

  @Prop({ required: true })
  title!: string;

  @Prop({ required: true })
  excerpt!: string;

  @Prop({ required: true })
  body!: string;

  @Prop({ required: true, type: Types.ObjectId, index: true })
  authorIdentityId!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, index: true })
  authorPositionId!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, index: true })
  organizationId!: Types.ObjectId;

  @Prop({ type: Object, required: true })
  authorSnapshot!: AuthorSnapshot;

  @Prop({ default: 0 })
  views!: number;

  @Prop({ default: 0 })
  reactions!: number;

  @Prop({ type: [String], default: [] })
  reactionUserIds!: string[];

  @Prop({ default: 0 })
  replyCount!: number;

  @Prop({ type: [String], default: [] })
  tags!: string[];

  @Prop({ default: false, index: true })
  pinned!: boolean;

  @Prop({ default: false })
  solved!: boolean;

  @Prop({ default: false })
  locked!: boolean;

  @Prop({ type: Object, default: null })
  exchange?: ExchangeMeta | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export const CommunityThreadSchema = SchemaFactory.createForClass(CommunityThreadDocument);
CommunityThreadSchema.index({ sectionId: 1, pinned: -1, createdAt: -1 });
CommunityThreadSchema.index({ type: 1, 'exchange.status': 1, createdAt: -1 });
