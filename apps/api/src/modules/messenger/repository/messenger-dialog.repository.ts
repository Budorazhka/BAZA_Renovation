import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, FilterQuery, Model, Types } from 'mongoose';
import {
  MessengerDialogDocument,
  type DialogLastMessage,
} from '../schemas/messenger-dialog.schema';
import type { MessengerPlatform } from '../schemas/messenger-account.schema';

export interface CreateMessengerDialogParams {
  organizationId: Types.ObjectId;
  accountId: Types.ObjectId;
  assignedPositionId?: Types.ObjectId;
  platform: MessengerPlatform;
  externalChatId: string;
  name: string;
  clientPhone?: string;
  clientHandle?: string;
  clientCity?: string;
  avatarUrl?: string;
  leadId?: Types.ObjectId;
  contactId?: Types.ObjectId;
  dealId?: Types.ObjectId;
  tags?: string[];
}

export interface ListDialogsFilter {
  organizationId: Types.ObjectId;
  assignedPositionId?: Types.ObjectId;
  accountId?: Types.ObjectId;
  platform?: MessengerPlatform;
  leadId?: Types.ObjectId;
  contactId?: Types.ObjectId;
  dealId?: Types.ObjectId;
  search?: string;
  cursor?: Types.ObjectId;
  limit: number;
}

@Injectable()
export class MessengerDialogRepository {
  constructor(
    @InjectModel(MessengerDialogDocument.name)
    private readonly model: Model<MessengerDialogDocument>,
  ) {}

  async create(params: CreateMessengerDialogParams, session?: ClientSession): Promise<MessengerDialogDocument> {
    const [doc] = await this.model.create(
      [
        {
          ...params,
          unreadCount: 0,
          pinned: false,
          tags: params.tags ?? [],
          version: 0,
        },
      ],
      { session },
    );
    return doc!;
  }

  async findByIdForOrganization(
    id: Types.ObjectId,
    organizationId: Types.ObjectId,
    session?: ClientSession,
  ): Promise<MessengerDialogDocument | null> {
    return this.model.findOne({ _id: id, organizationId }, null, { session }).exec();
  }

  async findByExternalChatId(
    organizationId: Types.ObjectId,
    accountId: Types.ObjectId,
    externalChatId: string,
    session?: ClientSession,
  ): Promise<MessengerDialogDocument | null> {
    return this.model.findOne({ organizationId, accountId, externalChatId }, null, { session }).exec();
  }

  async listForOrganization(filter: ListDialogsFilter): Promise<MessengerDialogDocument[]> {
    const query: FilterQuery<MessengerDialogDocument> = {
      organizationId: filter.organizationId,
    };

    if (filter.assignedPositionId) query.assignedPositionId = filter.assignedPositionId;
    if (filter.accountId) query.accountId = filter.accountId;
    if (filter.platform) query.platform = filter.platform;
    if (filter.leadId) query.leadId = filter.leadId;
    if (filter.contactId) query.contactId = filter.contactId;
    if (filter.dealId) query.dealId = filter.dealId;

    if (filter.search) {
      const sanitized = filter.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const reg = new RegExp(sanitized, 'i');
      query.$or = [{ name: reg }, { clientPhone: reg }, { clientHandle: reg }];
    }

    if (filter.cursor) {
      query._id = { $lt: filter.cursor };
    }

    return this.model
      .find(query)
      .sort({ pinned: -1, 'lastMessage.sentAt': -1, _id: -1 })
      .limit(filter.limit)
      .exec();
  }

  async updateLastMessage(
    dialogId: Types.ObjectId,
    organizationId: Types.ObjectId,
    lastMessage: DialogLastMessage,
    incrementUnread: boolean,
    session?: ClientSession,
  ): Promise<MessengerDialogDocument | null> {
    const update: Record<string, unknown> = {
      $set: { lastMessage },
      $inc: { version: 1 },
    };
    if (incrementUnread) {
      update.$inc = { ...(update.$inc as object), unreadCount: 1 };
    }

    return this.model.findOneAndUpdate(
      { _id: dialogId, organizationId },
      update,
      { new: true, session },
    ).exec();
  }

  async markAsRead(
    dialogId: Types.ObjectId,
    organizationId: Types.ObjectId,
    session?: ClientSession,
  ): Promise<MessengerDialogDocument | null> {
    return this.model.findOneAndUpdate(
      { _id: dialogId, organizationId },
      { $set: { unreadCount: 0 }, $inc: { version: 1 } },
      { new: true, session },
    ).exec();
  }

  async linkCrm(
    dialogId: Types.ObjectId,
    organizationId: Types.ObjectId,
    links: { leadId?: Types.ObjectId; contactId?: Types.ObjectId; dealId?: Types.ObjectId },
    session?: ClientSession,
  ): Promise<MessengerDialogDocument | null> {
    const setFields: Record<string, unknown> = {};
    if (links.leadId !== undefined) setFields.leadId = links.leadId;
    if (links.contactId !== undefined) setFields.contactId = links.contactId;
    if (links.dealId !== undefined) setFields.dealId = links.dealId;

    return this.model.findOneAndUpdate(
      { _id: dialogId, organizationId },
      { $set: setFields, $inc: { version: 1 } },
      { new: true, session },
    ).exec();
  }

  async deleteForOrganization(
    dialogId: Types.ObjectId,
    organizationId: Types.ObjectId,
    session?: ClientSession,
  ): Promise<boolean> {
    const res = await this.model.deleteOne({ _id: dialogId, organizationId }, { session }).exec();
    return res.deletedCount > 0;
  }
}
