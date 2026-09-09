import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import {
  MessengerMessageDocument,
  type MessageAuthor,
  type MessageType,
  type MessageStatus,
  type MessageMedia,
} from '../schemas/messenger-message.schema';

export interface CreateMessengerMessageParams {
  organizationId: Types.ObjectId;
  dialogId: Types.ObjectId;
  externalMessageId?: string;
  author: MessageAuthor;
  senderPositionId?: Types.ObjectId;
  text: string;
  messageType?: MessageType;
  status?: MessageStatus;
  sentAt?: Date;
  media?: MessageMedia;
}

export interface ListMessagesFilter {
  organizationId: Types.ObjectId;
  dialogId: Types.ObjectId;
  cursor?: Types.ObjectId;
  limit: number;
}

@Injectable()
export class MessengerMessageRepository {
  constructor(
    @InjectModel(MessengerMessageDocument.name)
    private readonly model: Model<MessengerMessageDocument>,
  ) {}

  async create(params: CreateMessengerMessageParams, session?: ClientSession): Promise<MessengerMessageDocument> {
    const [doc] = await this.model.create(
      [
        {
          ...params,
          messageType: params.messageType ?? 'text',
          status: params.status ?? (params.author === 'agent' ? 'sent' : 'delivered'),
          sentAt: params.sentAt ?? new Date(),
        },
      ],
      { session },
    );
    return doc!;
  }

  async listForDialog(filter: ListMessagesFilter): Promise<MessengerMessageDocument[]> {
    const query: Record<string, unknown> = {
      organizationId: filter.organizationId,
      dialogId: filter.dialogId,
    };

    if (filter.cursor) {
      query._id = { $lt: filter.cursor };
    }

    return this.model
      .find(query)
      .sort({ sentAt: -1, _id: -1 })
      .limit(filter.limit)
      .exec();
  }

  async markDeliveredOrRead(
    dialogId: Types.ObjectId,
    organizationId: Types.ObjectId,
    status: 'delivered' | 'read',
    session?: ClientSession,
  ): Promise<number> {
    const res = await this.model.updateMany(
      {
        dialogId,
        organizationId,
        author: 'client',
        status: { $ne: 'read' },
      },
      { $set: { status } },
      { session },
    ).exec();
    return res.modifiedCount;
  }
}
