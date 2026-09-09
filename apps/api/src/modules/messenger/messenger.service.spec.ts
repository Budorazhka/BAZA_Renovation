import { Test, TestingModule } from '@nestjs/testing';
import { getConnectionToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { MessengerService } from './messenger.service';
import { MessengerAccountRepository } from './repository/messenger-account.repository';
import { MessengerDialogRepository } from './repository/messenger-dialog.repository';
import { MessengerMessageRepository } from './repository/messenger-message.repository';
import { AuditService } from '../audit/audit.service';
import { OutboxService } from '../outbox/outbox.service';
import { CrmService } from '../crm/crm.service';
import { IdempotencyService } from '../../shared/idempotency/idempotency.service';

describe('MessengerService', () => {
  let service: MessengerService;
  let accountRepo: jest.Mocked<Partial<MessengerAccountRepository>>;
  let dialogRepo: jest.Mocked<Partial<MessengerDialogRepository>>;
  let messageRepo: jest.Mocked<Partial<MessengerMessageRepository>>;
  let auditService: jest.Mocked<Partial<AuditService>>;
  let outboxService: jest.Mocked<Partial<OutboxService>>;
  let crmService: jest.Mocked<Partial<CrmService>>;
  let idempotencyService: jest.Mocked<Partial<IdempotencyService>>;

  const fakeSession = {
    withTransaction: jest.fn().mockImplementation((cb) => cb(fakeSession as never)),
    endSession: jest.fn().mockResolvedValue(undefined),
  };

  const fakeConnection = {
    startSession: jest.fn().mockResolvedValue(fakeSession),
  };

  beforeEach(async () => {
    accountRepo = {
      create: jest.fn(),
      listForOrganization: jest.fn(),
      findByIdForOrganization: jest.fn(),
      deleteForOrganization: jest.fn(),
    };

    dialogRepo = {
      create: jest.fn(),
      listForOrganization: jest.fn(),
      findByIdForOrganization: jest.fn(),
      findByExternalChatId: jest.fn(),
      updateLastMessage: jest.fn(),
      markAsRead: jest.fn(),
      linkCrm: jest.fn(),
      deleteForOrganization: jest.fn(),
    };

    messageRepo = {
      create: jest.fn(),
      listForDialog: jest.fn(),
      markDeliveredOrRead: jest.fn(),
    };

    auditService = {
      append: jest.fn().mockResolvedValue(undefined),
    };

    outboxService = {
      publish: jest.fn().mockResolvedValue(undefined),
    };

    crmService = {
      createTask: jest.fn().mockResolvedValue({ id: 'task-123' } as never),
    };

    idempotencyService = {
      record: jest.fn().mockResolvedValue(undefined),
      checkReplay: jest.fn().mockResolvedValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessengerService,
        { provide: getConnectionToken(), useValue: fakeConnection },
        { provide: MessengerAccountRepository, useValue: accountRepo },
        { provide: MessengerDialogRepository, useValue: dialogRepo },
        { provide: MessengerMessageRepository, useValue: messageRepo },
        { provide: AuditService, useValue: auditService },
        { provide: OutboxService, useValue: outboxService },
        { provide: CrmService, useValue: crmService },
        { provide: IdempotencyService, useValue: idempotencyService },
      ],
    }).compile();

    service = module.get<MessengerService>(MessengerService);
  });

  it('adds telegram bot account with audit trail', async () => {
    const orgId = new Types.ObjectId();
    const fakeDoc = {
      _id: new Types.ObjectId(),
      organizationId: orgId,
      platform: 'telegram',
      accountType: 'bot',
      name: 'Sales Bot',
      authStatus: 'authenticated',
      isActive: true,
      createdAt: new Date(),
    };
    (accountRepo.create as jest.Mock).mockResolvedValue(fakeDoc);

    const result = await service.addTelegramBot({
      organizationId: orgId,
      actorIdentityId: new Types.ObjectId(),
      name: 'Sales Bot',
      botToken: '12345:token',
      correlationId: 'cor-1',
    });

    expect(result.name).toBe('Sales Bot');
    expect(result.platform).toBe('telegram');
    expect(auditService.append).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'messenger_account.create',
        resource: 'messenger_account',
      }),
      fakeSession,
    );
  });

  it('sends text message and updates dialog lastMessage', async () => {
    const orgId = new Types.ObjectId();
    const dialogId = new Types.ObjectId();
    const fakeDialog = {
      _id: dialogId,
      organizationId: orgId,
      platform: 'telegram',
      externalChatId: 'chat-99',
    };
    (dialogRepo.findByIdForOrganization as jest.Mock).mockResolvedValue(fakeDialog);

    const fakeMessage = {
      _id: new Types.ObjectId(),
      organizationId: orgId,
      dialogId,
      author: 'agent',
      text: 'Добрый день!',
      messageType: 'text',
      status: 'sent',
      sentAt: new Date(),
    };
    (messageRepo.create as jest.Mock).mockResolvedValue(fakeMessage);

    const res = await service.sendTextMessage({
      organizationId: orgId,
      dialogId,
      text: 'Добрый день!',
    });

    expect(res.text).toBe('Добрый день!');
    expect(dialogRepo.updateLastMessage).toHaveBeenCalled();
    expect(outboxService.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'MessengerMessageSent',
        aggregateId: dialogId,
      }),
      fakeSession,
    );
  });

  it('creates crm task directly from dialog context', async () => {
    const orgId = new Types.ObjectId();
    const dialogId = new Types.ObjectId();
    const leadId = new Types.ObjectId();
    const fakeDialog = {
      _id: dialogId,
      organizationId: orgId,
      name: 'Иван Клиент',
      platform: 'whatsapp',
      leadId,
    };
    (dialogRepo.findByIdForOrganization as jest.Mock).mockResolvedValue(fakeDialog);

    const res = await service.createTaskFromDialog({
      organizationId: orgId,
      dialogId,
      actorIdentityId: new Types.ObjectId(),
      actorPositionId: new Types.ObjectId(),
      title: 'Перезвонить клиенту из WhatsApp',
      correlationId: 'cor-task',
      idempotencyKey: 'idemp-1',
      idempotencyRequestBody: { title: 'Перезвонить клиенту из WhatsApp' },
    });

    expect(res).toEqual({ id: 'task-123' });
    expect(crmService.createTask).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Перезвонить клиенту из WhatsApp',
        leadId,
      }),
    );
  });
});
