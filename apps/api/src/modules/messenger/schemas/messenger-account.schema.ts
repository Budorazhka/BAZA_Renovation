import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type MessengerPlatform = 'telegram' | 'whatsapp';
export type MessengerAccountType = 'bot' | 'user';
export type MessengerAuthStatus = 'pending' | 'authenticated' | 'disconnected';

export const MESSENGER_PLATFORMS: readonly MessengerPlatform[] = ['telegram', 'whatsapp'] as const;
export const MESSENGER_ACCOUNT_TYPES: readonly MessengerAccountType[] = ['bot', 'user'] as const;
export const MESSENGER_AUTH_STATUSES: readonly MessengerAuthStatus[] = ['pending', 'authenticated', 'disconnected'] as const;

/**
 * Server-side storage for external messaging accounts (Telegram bot, WhatsApp).
 * Tokens and credentials are kept strictly on the backend (never leaked to browser).
 */
@Schema({ collection: 'messenger_accounts', timestamps: true })
export class MessengerAccountDocument extends Document {
  declare _id: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId })
  organizationId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: false })
  assignedPositionId?: Types.ObjectId;

  @Prop({ required: true, type: String, enum: MESSENGER_PLATFORMS })
  platform!: MessengerPlatform;

  @Prop({ required: true, type: String, enum: MESSENGER_ACCOUNT_TYPES, default: 'bot' })
  accountType!: MessengerAccountType;

  @Prop({ required: true, trim: true, maxlength: 120 })
  name!: string;

  /**
   * Secret token for Telegram Bot API or session identifier.
   * Never returned in public read models.
   */
  @Prop({ required: false, trim: true })
  botToken?: string;

  @Prop({ required: false, trim: true })
  telegramBotUsername?: string;

  @Prop({ required: false, trim: true })
  phoneNumber?: string;

  @Prop({ required: true, type: String, enum: MESSENGER_AUTH_STATUSES, default: 'pending' })
  authStatus!: MessengerAuthStatus;

  @Prop({ required: true, default: true })
  isActive!: boolean;

  @Prop({ required: false, type: Date })
  lastSyncAt?: Date;
}

export const MessengerAccountSchema = SchemaFactory.createForClass(MessengerAccountDocument);

MessengerAccountSchema.index({ organizationId: 1, platform: 1 });
MessengerAccountSchema.index({ organizationId: 1, isActive: 1 });
