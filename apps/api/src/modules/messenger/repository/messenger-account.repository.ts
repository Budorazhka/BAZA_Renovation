import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import {
  MessengerAccountDocument,
  type MessengerPlatform,
  type MessengerAccountType,
} from '../schemas/messenger-account.schema';

export interface CreateMessengerAccountParams {
  organizationId: Types.ObjectId;
  assignedPositionId?: Types.ObjectId;
  platform: MessengerPlatform;
  accountType?: MessengerAccountType;
  name: string;
  botToken?: string;
  telegramBotUsername?: string;
  phoneNumber?: string;
}

@Injectable()
export class MessengerAccountRepository {
  constructor(
    @InjectModel(MessengerAccountDocument.name)
    private readonly model: Model<MessengerAccountDocument>,
  ) {}

  async create(params: CreateMessengerAccountParams, session?: ClientSession): Promise<MessengerAccountDocument> {
    const [doc] = await this.model.create(
      [
        {
          organizationId: params.organizationId,
          assignedPositionId: params.assignedPositionId,
          platform: params.platform,
          accountType: params.accountType ?? 'bot',
          name: params.name,
          botToken: params.botToken,
          telegramBotUsername: params.telegramBotUsername,
          phoneNumber: params.phoneNumber,
          // 11.09.2026: было 'authenticated' и lastSyncAt = сейчас — без единой
          // проверки у провайдера (токен бота не проверяется через getMe, у
          // WhatsApp учётных данных нет вовсе). Аккаунт pending, пока
          // подключение не подтвердит будущий транспорт; синхронизации не было.
          authStatus: 'pending',
          isActive: true,
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
  ): Promise<MessengerAccountDocument | null> {
    return this.model.findOne({ _id: id, organizationId }, null, { session }).exec();
  }

  async listForOrganization(
    organizationId: Types.ObjectId,
    platform?: MessengerPlatform,
  ): Promise<MessengerAccountDocument[]> {
    const filter: Record<string, unknown> = { organizationId };
    if (platform) filter.platform = platform;
    return this.model.find(filter).sort({ createdAt: -1 }).exec();
  }

  async deleteForOrganization(
    id: Types.ObjectId,
    organizationId: Types.ObjectId,
    session?: ClientSession,
  ): Promise<boolean> {
    const res = await this.model.deleteOne({ _id: id, organizationId }, { session }).exec();
    return res.deletedCount > 0;
  }
}
