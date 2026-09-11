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
          // Исходящее без явного статуса — queued: отправлять его пока некому.
          status: params.status ?? (params.author === 'agent' ? 'queued' : 'delivered'),
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

  /**
   * ИСПРАВЛЕНО 11.09.2026: каскад из MessengerService.deleteAccount — см.
   * MessengerDialogRepository.deleteByAccountId. dialogIds может быть
   * пустым (аккаунт без единого диалога) — тогда deleteMany с пустым $in
   * просто ничего не находит, отдельная проверка не нужна.
   */
  async deleteByDialogIds(
    organizationId: Types.ObjectId,
    dialogIds: Types.ObjectId[],
    session?: ClientSession,
  ): Promise<number> {
    const res = await this.model.deleteMany({ organizationId, dialogId: { $in: dialogIds } }, { session }).exec();
    return res.deletedCount;
  }
}
