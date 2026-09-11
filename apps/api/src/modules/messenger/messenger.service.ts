import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import { runInTransaction } from '../../shared/transactions/run-in-transaction';
import { AuditService } from '../audit/audit.service';
import { OutboxService } from '../outbox/outbox.service';
import { CrmService } from '../crm/crm.service';
import { IdempotencyService } from '../../shared/idempotency/idempotency.service';
import { MessengerAccountRepository } from './repository/messenger-account.repository';
import { MessengerDialogRepository } from './repository/messenger-dialog.repository';
import { MessengerMessageRepository } from './repository/messenger-message.repository';
import type {
  MessengerAccountDocument,
  MessengerPlatform,
} from './schemas/messenger-account.schema';
import type {
  MessengerDialogDocument,
  DialogLastMessage,
} from './schemas/messenger-dialog.schema';
import type {
  MessengerMessageDocument,
  MessageType,
  MessageMedia,
} from './schemas/messenger-message.schema';

export interface MessengerAccountReadModel {
  id: string;
  organizationId: string;
  assignedPositionId: string | null;
  platform: MessengerPlatform;
  accountType: string;
  name: string;
  telegramBotUsername: string | null;
  phoneNumber: string | null;
  authStatus: string;
  isActive: boolean;
  lastSyncAt: string | null;
  createdAt: string;
}

export interface MessengerDialogReadModel {
  id: string;
  organizationId: string;
  accountId: string;
  assignedPositionId: string | null;
  platform: MessengerPlatform;
  externalChatId: string;
  name: string;
  clientPhone: string | null;
  clientHandle: string | null;
  clientCity: string | null;
  avatarUrl: string | null;
  unreadCount: number;
  pinned: boolean;
  lastMessage: {
    text: string;
    sentAt: string;
    fromMe: boolean;
    author: 'client' | 'agent';
  } | null;
  leadId: string | null;
  contactId: string | null;
  dealId: string | null;
  tags: string[];
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface MessengerMessageReadModel {
  id: string;
  organizationId: string;
  dialogId: string;
  externalMessageId: string | null;
  author: 'client' | 'agent';
  senderPositionId: string | null;
  text: string;
  messageType: MessageType;
  status: string;
  sentAt: string;
  media: {
    assetId: string | null;
    url: string | null;
    mimeType: string | null;
    fileName: string | null;
  } | null;
}

function toAccountReadModel(doc: MessengerAccountDocument): MessengerAccountReadModel {
  return {
    id: doc._id.toString(),
    organizationId: doc.organizationId.toString(),
    assignedPositionId: doc.assignedPositionId ? doc.assignedPositionId.toString() : null,
    platform: doc.platform,
    accountType: doc.accountType,
    name: doc.name,
    telegramBotUsername: doc.telegramBotUsername ?? null,
    phoneNumber: doc.phoneNumber ?? null,
    authStatus: doc.authStatus,
    isActive: doc.isActive,
    lastSyncAt: doc.lastSyncAt ? doc.lastSyncAt.toISOString() : null,
    createdAt: (doc as unknown as { createdAt?: Date }).createdAt?.toISOString() ?? new Date().toISOString(),
  };
}

function toDialogReadModel(doc: MessengerDialogDocument): MessengerDialogReadModel {
  return {
    id: doc._id.toString(),
    organizationId: doc.organizationId.toString(),
    accountId: doc.accountId.toString(),
    assignedPositionId: doc.assignedPositionId ? doc.assignedPositionId.toString() : null,
    platform: doc.platform,
    externalChatId: doc.externalChatId,
    name: doc.name,
    clientPhone: doc.clientPhone ?? null,
    clientHandle: doc.clientHandle ?? null,
    clientCity: doc.clientCity ?? null,
    avatarUrl: doc.avatarUrl ?? null,
    unreadCount: doc.unreadCount,
    pinned: doc.pinned,
    lastMessage: doc.lastMessage
      ? {
          text: doc.lastMessage.text,
          sentAt: doc.lastMessage.sentAt.toISOString(),
          fromMe: doc.lastMessage.fromMe,
          author: doc.lastMessage.author,
        }
      : null,
    leadId: doc.leadId ? doc.leadId.toString() : null,
    contactId: doc.contactId ? doc.contactId.toString() : null,
    dealId: doc.dealId ? doc.dealId.toString() : null,
    tags: doc.tags ?? [],
    version: doc.version,
    createdAt: (doc as unknown as { createdAt?: Date }).createdAt?.toISOString() ?? new Date().toISOString(),
    updatedAt: (doc as unknown as { updatedAt?: Date }).updatedAt?.toISOString() ?? new Date().toISOString(),
  };
}

function toMessageReadModel(doc: MessengerMessageDocument): MessengerMessageReadModel {
  return {
    id: doc._id.toString(),
    organizationId: doc.organizationId.toString(),
    dialogId: doc.dialogId.toString(),
    externalMessageId: doc.externalMessageId ?? null,
    author: doc.author,
    senderPositionId: doc.senderPositionId ? doc.senderPositionId.toString() : null,
    text: doc.text,
    messageType: doc.messageType,
    status: doc.status,
    sentAt: doc.sentAt.toISOString(),
    media: doc.media
      ? {
          assetId: doc.media.assetId ? doc.media.assetId.toString() : null,
          url: doc.media.url ?? null,
          mimeType: doc.media.mimeType ?? null,
          fileName: doc.media.fileName ?? null,
        }
      : null,
  };
}

@Injectable()
export class MessengerService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly accountRepository: MessengerAccountRepository,
    private readonly dialogRepository: MessengerDialogRepository,
    private readonly messageRepository: MessengerMessageRepository,
    private readonly auditService: AuditService,
    private readonly outboxService: OutboxService,
    private readonly crmService: CrmService,
    private readonly idempotencyService: IdempotencyService,
  ) {}

  async listAccounts(
    organizationId: Types.ObjectId,
    platform?: MessengerPlatform,
  ): Promise<MessengerAccountReadModel[]> {
    const docs = await this.accountRepository.listForOrganization(organizationId, platform);
    return docs.map(toAccountReadModel);
  }

  async addTelegramBot(params: {
    organizationId: Types.ObjectId;
    actorIdentityId: Types.ObjectId;
    assignedPositionId?: Types.ObjectId;
    name: string;
    botToken: string;
    correlationId: string;
    idempotencyKey?: string;
    idempotencyRequestBody?: Record<string, unknown>;
  }): Promise<MessengerAccountReadModel> {
    return runInTransaction(this.connection, async (session) => {
      const doc = await this.accountRepository.create(
        {
          organizationId: params.organizationId,
          assignedPositionId: params.assignedPositionId,
          platform: 'telegram',
          accountType: 'bot',
          name: params.name,
          botToken: params.botToken,
        },
        session,
      );

      await this.auditService.append(
        {
          actor: { type: 'identity', id: params.actorIdentityId },
          action: 'messenger_account.create',
          resource: 'messenger_account',
          resourceId: doc._id,
          after: { platform: 'telegram', name: params.name },
          correlationId: params.correlationId,
        },
        session,
      );

      const readModel = toAccountReadModel(doc);

      if (params.idempotencyKey && params.idempotencyRequestBody) {
        await this.idempotencyService.record(
          {
            identityId: params.actorIdentityId,
            operation: 'addTelegramBotAccount',
            key: params.idempotencyKey,
            requestBody: params.idempotencyRequestBody,
            responseStatus: 201,
            responseBody: readModel as unknown as Record<string, unknown>,
          },
          session,
        );
      }

      return readModel;
    });
  }

  async addWhatsAppAccount(params: {
    organizationId: Types.ObjectId;
    actorIdentityId: Types.ObjectId;
    assignedPositionId?: Types.ObjectId;
    name: string;
    phoneNumber?: string;
    correlationId: string;
    idempotencyKey?: string;
    idempotencyRequestBody?: Record<string, unknown>;
  }): Promise<MessengerAccountReadModel> {
    return runInTransaction(this.connection, async (session) => {
      const doc = await this.accountRepository.create(
        {
          organizationId: params.organizationId,
          assignedPositionId: params.assignedPositionId,
          platform: 'whatsapp',
          accountType: 'user',
          name: params.name,
          phoneNumber: params.phoneNumber,
        },
        session,
      );

      await this.auditService.append(
        {
          actor: { type: 'identity', id: params.actorIdentityId },
          action: 'messenger_account.create',
          resource: 'messenger_account',
          resourceId: doc._id,
          after: { platform: 'whatsapp', name: params.name },
          correlationId: params.correlationId,
        },
        session,
      );

      const readModel = toAccountReadModel(doc);

      if (params.idempotencyKey && params.idempotencyRequestBody) {
        await this.idempotencyService.record(
          {
            identityId: params.actorIdentityId,
            operation: 'addWhatsAppAccount',
            key: params.idempotencyKey,
            requestBody: params.idempotencyRequestBody,
            responseStatus: 201,
            responseBody: readModel as unknown as Record<string, unknown>,
          },
          session,
        );
      }

      return readModel;
    });
  }

  async deleteAccount(params: {
    organizationId: Types.ObjectId;
    accountId: Types.ObjectId;
    actorIdentityId: Types.ObjectId;
    correlationId: string;
  }): Promise<boolean> {
    return runInTransaction(this.connection, async (session) => {
      const existing = await this.accountRepository.findByIdForOrganization(
        params.accountId,
        params.organizationId,
        session,
      );
      if (!existing) {
        throw new NotFoundException('Учётная запись мессенджера не найдена');
      }

      const deleted = await this.accountRepository.deleteForOrganization(
        params.accountId,
        params.organizationId,
        session,
      );

      await this.auditService.append(
        {
          actor: { type: 'identity', id: params.actorIdentityId },
          action: 'messenger_account.delete',
          resource: 'messenger_account',
          resourceId: params.accountId,
          before: { name: existing.name, platform: existing.platform },
          correlationId: params.correlationId,
        },
        session,
      );

      return deleted;
    });
  }

  async listDialogs(params: {
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
  }): Promise<MessengerDialogReadModel[]> {
    const docs = await this.dialogRepository.listForOrganization({
      organizationId: params.organizationId,
      assignedPositionId: params.assignedPositionId,
      accountId: params.accountId,
      platform: params.platform,
      leadId: params.leadId,
      contactId: params.contactId,
      dealId: params.dealId,
      search: params.search,
      cursor: params.cursor,
      limit: Math.min(params.limit, 100),
    });

    return docs.map(toDialogReadModel);
  }

  /**
   * Own-scope сужение для диалога (ADR-002-style non-disclosure: чужой диалог
   * той же организации — тот же `NotFoundException`, что диалог из чужой
   * организации, не отдельный 403, который раскрывал бы сам факт его
   * существования). Диалог без `assignedPositionId` (ещё не взят в работу)
   * own-scope НЕ блокирует — тот же принцип, что у непринятого лида: свободные
   * диалоги открыты любому в организации, пока их не забрал кто-то конкретный.
   *
   * ИСПРАВЛЕНО 11.09.2026: раньше эту проверку делал только getDialog (и
   * то, что вызывает его — listMessages/markDialogRead) — sendTextMessage/
   * sendMediaMessage/linkDialogToCrm/createTaskFromDialog own-scope не
   * проверяли вовсе, хотя каждый из них читает диалог тем же
   * findByIdForOrganization прямо перед мутацией.
   */
  private assertDialogOwnership(dialog: MessengerDialogDocument, assignedPositionId?: Types.ObjectId): void {
    if (assignedPositionId && dialog.assignedPositionId && !dialog.assignedPositionId.equals(assignedPositionId)) {
      throw new NotFoundException('Диалог не найден');
    }
  }

  async getDialog(params: {
    organizationId: Types.ObjectId;
    dialogId: Types.ObjectId;
    assignedPositionId?: Types.ObjectId;
  }): Promise<MessengerDialogReadModel> {
    const doc = await this.dialogRepository.findByIdForOrganization(params.dialogId, params.organizationId);
    if (!doc) {
      throw new NotFoundException('Диалог не найден');
    }
    this.assertDialogOwnership(doc, params.assignedPositionId);
    return toDialogReadModel(doc);
  }

  async listMessages(params: {
    organizationId: Types.ObjectId;
    dialogId: Types.ObjectId;
    assignedPositionId?: Types.ObjectId;
    cursor?: Types.ObjectId;
    limit: number;
  }): Promise<MessengerMessageReadModel[]> {
    await this.getDialog({
      organizationId: params.organizationId,
      dialogId: params.dialogId,
      assignedPositionId: params.assignedPositionId,
    });

    const docs = await this.messageRepository.listForDialog({
      organizationId: params.organizationId,
      dialogId: params.dialogId,
      cursor: params.cursor,
      limit: Math.min(params.limit, 200),
    });

    return docs.map(toMessageReadModel);
  }

  async sendTextMessage(params: {
    organizationId: Types.ObjectId;
    dialogId: Types.ObjectId;
    assignedPositionId?: Types.ObjectId;
    senderPositionId?: Types.ObjectId;
    actorIdentityId?: Types.ObjectId;
    text: string;
    correlationId?: string;
    idempotencyKey?: string;
    idempotencyRequestBody?: Record<string, unknown>;
  }): Promise<MessengerMessageReadModel> {
    return runInTransaction(this.connection, async (session) => {
      const dialog = await this.dialogRepository.findByIdForOrganization(params.dialogId, params.organizationId, session);
      if (!dialog) {
        throw new NotFoundException('Диалог не найден');
      }
      this.assertDialogOwnership(dialog, params.assignedPositionId);

      const now = new Date();
      const message = await this.messageRepository.create(
        {
          organizationId: params.organizationId,
          dialogId: params.dialogId,
          author: 'agent',
          senderPositionId: params.senderPositionId,
          text: params.text,
          messageType: 'text',
          // queued, не sent: транспорта нет, воркер событие только подтверждает.
          status: 'queued',
          sentAt: now,
        },
        session,
      );

      const lastMessage: DialogLastMessage = {
        text: params.text,
        sentAt: now,
        fromMe: true,
        author: 'agent',
      };

      await this.dialogRepository.updateLastMessage(params.dialogId, params.organizationId, lastMessage, false, session);

      await this.outboxService.publish(
        {
          eventType: 'MessengerMessageSent',
          aggregateType: 'messenger_dialog',
          aggregateId: params.dialogId,
          payload: {
            dialogId: params.dialogId.toString(),
            messageId: message._id.toString(),
            platform: dialog.platform,
            externalChatId: dialog.externalChatId,
            text: params.text,
            correlationId: params.correlationId,
          },
          deduplicationKey: `msg:${message._id.toString()}:sent`,
        },
        session,
      );

      const readModel = toMessageReadModel(message);

      if (params.idempotencyKey && params.idempotencyRequestBody && params.actorIdentityId) {
        await this.idempotencyService.record(
          {
            identityId: params.actorIdentityId,
            operation: 'sendMessengerTextMessage',
            key: params.idempotencyKey,
            requestBody: params.idempotencyRequestBody,
            responseStatus: 201,
            responseBody: readModel as unknown as Record<string, unknown>,
          },
          session,
        );
      }

      return readModel;
    });
  }

  async sendMediaMessage(params: {
    organizationId: Types.ObjectId;
    dialogId: Types.ObjectId;
    assignedPositionId?: Types.ObjectId;
    senderPositionId?: Types.ObjectId;
    actorIdentityId?: Types.ObjectId;
    text?: string;
    messageType?: MessageType;
    media?: MessageMedia;
    correlationId?: string;
    idempotencyKey?: string;
    idempotencyRequestBody?: Record<string, unknown>;
  }): Promise<MessengerMessageReadModel> {
    return runInTransaction(this.connection, async (session) => {
      const dialog = await this.dialogRepository.findByIdForOrganization(params.dialogId, params.organizationId, session);
      if (!dialog) {
        throw new NotFoundException('Диалог не найден');
      }
      this.assertDialogOwnership(dialog, params.assignedPositionId);

      const now = new Date();
      const displayText = params.text || (params.media?.fileName ? `[Файл: ${params.media.fileName}]` : '[Вложение]');

      const message = await this.messageRepository.create(
        {
          organizationId: params.organizationId,
          dialogId: params.dialogId,
          author: 'agent',
          senderPositionId: params.senderPositionId,
          text: displayText,
          messageType: params.messageType ?? 'document',
          media: params.media,
          // queued, не sent: транспорта нет, воркер событие только подтверждает.
          status: 'queued',
          sentAt: now,
        },
        session,
      );

      const lastMessage: DialogLastMessage = {
        text: displayText,
        sentAt: now,
        fromMe: true,
        author: 'agent',
      };

      await this.dialogRepository.updateLastMessage(params.dialogId, params.organizationId, lastMessage, false, session);

      await this.outboxService.publish(
        {
          eventType: 'MessengerMessageSent',
          aggregateType: 'messenger_dialog',
          aggregateId: params.dialogId,
          payload: {
            dialogId: params.dialogId.toString(),
            messageId: message._id.toString(),
            platform: dialog.platform,
            externalChatId: dialog.externalChatId,
            text: displayText,
            correlationId: params.correlationId,
          },
          deduplicationKey: `msg:${message._id.toString()}:sent`,
        },
        session,
      );

      const readModel = toMessageReadModel(message);

      if (params.idempotencyKey && params.idempotencyRequestBody && params.actorIdentityId) {
        await this.idempotencyService.record(
          {
            identityId: params.actorIdentityId,
            operation: 'sendMessengerMediaMessage',
            key: params.idempotencyKey,
            requestBody: params.idempotencyRequestBody,
            responseStatus: 201,
            responseBody: readModel as unknown as Record<string, unknown>,
          },
          session,
        );
      }

      return readModel;
    });
  }

  async markDialogRead(params: {
    organizationId: Types.ObjectId;
    dialogId: Types.ObjectId;
    assignedPositionId?: Types.ObjectId;
  }): Promise<boolean> {
    await this.getDialog({
      organizationId: params.organizationId,
      dialogId: params.dialogId,
      assignedPositionId: params.assignedPositionId,
    });

    const updated = await this.dialogRepository.markAsRead(params.dialogId, params.organizationId);
    return Boolean(updated);
  }

  async linkDialogToCrm(params: {
    organizationId: Types.ObjectId;
    dialogId: Types.ObjectId;
    assignedPositionId?: Types.ObjectId;
    leadId?: Types.ObjectId;
    contactId?: Types.ObjectId;
    dealId?: Types.ObjectId;
    actorIdentityId: Types.ObjectId;
    correlationId: string;
  }): Promise<MessengerDialogReadModel> {
    return runInTransaction(this.connection, async (session) => {
      const dialog = await this.dialogRepository.findByIdForOrganization(params.dialogId, params.organizationId, session);
      if (!dialog) {
        throw new NotFoundException('Диалог не найден');
      }
      this.assertDialogOwnership(dialog, params.assignedPositionId);

      // Без этих проверок leadId/contactId/dealId писались в диалог как
      // есть, без подтверждения, что запись вообще существует и
      // принадлежит организации вызывающего (11.09.2026): диалог можно
      // было привязать к CRM-записи чужой организации, подобрав чужой
      // ObjectId. Own-scope конкретной записи (например лида,
      // назначенного другому менеджеру) сюда намеренно не входит — это
      // отдельный, ещё не закрытый вопрос, см. messenger-skeleton.md.
      if (params.leadId) {
        await this.crmService.getLeadForOrganization(params.leadId, params.organizationId);
      }
      if (params.contactId) {
        await this.crmService.getContactForOrganization(params.contactId, params.organizationId);
      }
      if (params.dealId) {
        await this.crmService.getDealForOrganization(params.dealId, params.organizationId);
      }

      const updated = await this.dialogRepository.linkCrm(
        params.dialogId,
        params.organizationId,
        { leadId: params.leadId, contactId: params.contactId, dealId: params.dealId },
        session,
      );

      await this.auditService.append(
        {
          actor: { type: 'identity', id: params.actorIdentityId },
          action: 'messenger_dialog.link_crm',
          resource: 'messenger_dialog',
          resourceId: params.dialogId,
          before: { leadId: dialog.leadId?.toString(), contactId: dialog.contactId?.toString(), dealId: dialog.dealId?.toString() },
          after: { leadId: params.leadId?.toString(), contactId: params.contactId?.toString(), dealId: params.dealId?.toString() },
          correlationId: params.correlationId,
        },
        session,
      );

      return toDialogReadModel(updated!);
    });
  }

  async createTaskFromDialog(params: {
    organizationId: Types.ObjectId;
    dialogId: Types.ObjectId;
    assignedPositionId?: Types.ObjectId;
    actorIdentityId: Types.ObjectId;
    actorPositionId: Types.ObjectId;
    title: string;
    description?: string;
    dueAt?: Date;
    isUrgent?: boolean;
    isImportant?: boolean;
    correlationId: string;
    idempotencyKey: string;
    idempotencyRequestBody: Record<string, unknown>;
  }) {
    const dialog = await this.dialogRepository.findByIdForOrganization(params.dialogId, params.organizationId);
    if (!dialog) {
      throw new NotFoundException('Диалог не найден');
    }
    this.assertDialogOwnership(dialog, params.assignedPositionId);

    const descWithDialog = [
      params.description?.trim(),
      `[Создано из диалога ${dialog.name} (${dialog.platform})]`,
    ].filter(Boolean).join('\n\n');

    return this.crmService.createTask({
      organizationId: params.organizationId,
      actorIdentityId: params.actorIdentityId,
      actorPositionId: params.actorPositionId,
      title: params.title,
      description: descWithDialog,
      dueAt: params.dueAt,
      assignedPositionId: dialog.assignedPositionId ?? params.actorPositionId,
      leadId: dialog.leadId,
      contactId: dialog.contactId,
      isUrgent: params.isUrgent,
      isImportant: params.isImportant,
      taskCategory: 'work',
      correlationId: params.correlationId,
      idempotencyKey: params.idempotencyKey,
      idempotencyRequestBody: params.idempotencyRequestBody,
    });
  }
}
