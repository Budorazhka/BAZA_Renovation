import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
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
      authStatus: 'pending',
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
      status: 'queued',
      sentAt: new Date(),
    };
    (messageRepo.create as jest.Mock).mockResolvedValue(fakeMessage);

    const res = await service.sendTextMessage({
      organizationId: orgId,
      dialogId,
      text: 'Добрый день!',
    });

    expect(res.text).toBe('Добрый день!');
    // Транспорта нет — «отправлено» платформа сказать не может.
    expect(messageRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'queued' }),
      fakeSession,
    );
    expect(res.status).toBe('queued');
    expect(dialogRepo.updateLastMessage).toHaveBeenCalled();
    expect(outboxService.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'MessengerMessageSent',
        aggregateId: dialogId,
      }),
      fakeSession,
    );
  });

  it('sends media message as queued, not sent', async () => {
    const orgId = new Types.ObjectId();
    const dialogId = new Types.ObjectId();
    (dialogRepo.findByIdForOrganization as jest.Mock).mockResolvedValue({
      _id: dialogId,
      organizationId: orgId,
      platform: 'telegram',
      externalChatId: 'chat-99',
    });
    (messageRepo.create as jest.Mock).mockResolvedValue({
      _id: new Types.ObjectId(),
      organizationId: orgId,
      dialogId,
      author: 'agent',
      text: '[Файл: plan.pdf]',
      messageType: 'document',
      status: 'queued',
      sentAt: new Date(),
    });

    await service.sendMediaMessage({
      organizationId: orgId,
      dialogId,
      media: { fileName: 'plan.pdf', url: 'https://example.test/plan.pdf' },
    });

    expect(messageRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'queued', messageType: 'document' }),
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

  describe('own-scope на запись: чужой диалог не даёт писать/перепривязывать/создавать задачу', () => {
    // ИСПРАВЛЕНО 11.09.2026: раньше assignedPositionId проверялся только на
    // чтение (getDialog/listMessages/markDialogRead) — эти четыре метода
    // мутировали любой диалог организации независимо от own-scope.
    const orgId = new Types.ObjectId();
    const dialogId = new Types.ObjectId();
    const ownerPositionId = new Types.ObjectId();
    const otherPositionId = new Types.ObjectId();

    function mockDialog(assignedPositionId: Types.ObjectId | undefined) {
      (dialogRepo.findByIdForOrganization as jest.Mock).mockResolvedValue({
        _id: dialogId,
        organizationId: orgId,
        platform: 'telegram',
        externalChatId: 'chat-99',
        name: 'Иван Клиент',
        assignedPositionId,
      });
    }

    it('sendTextMessage: диалог назначен другой позиции — NotFoundException, сообщение не создаётся', async () => {
      mockDialog(ownerPositionId);

      await expect(
        service.sendTextMessage({
          organizationId: orgId,
          dialogId,
          assignedPositionId: otherPositionId,
          text: 'Попытка обхода',
        }),
      ).rejects.toThrow('Диалог не найден');
      expect(messageRepo.create).not.toHaveBeenCalled();
    });

    it('sendTextMessage: свой диалог — own-scope не мешает отправить', async () => {
      mockDialog(ownerPositionId);
      (messageRepo.create as jest.Mock).mockResolvedValue({
        _id: new Types.ObjectId(),
        organizationId: orgId,
        dialogId,
        author: 'agent',
        text: 'Добрый день!',
        messageType: 'text',
        status: 'queued',
        sentAt: new Date(),
      });

      const res = await service.sendTextMessage({
        organizationId: orgId,
        dialogId,
        assignedPositionId: ownerPositionId,
        text: 'Добрый день!',
      });

      expect(res.text).toBe('Добрый день!');
    });

    it('sendTextMessage: диалог ещё не взят в работу (assignedPositionId не задан) — own-scope не блокирует', async () => {
      mockDialog(undefined);
      (messageRepo.create as jest.Mock).mockResolvedValue({
        _id: new Types.ObjectId(),
        organizationId: orgId,
        dialogId,
        author: 'agent',
        text: 'Здравствуйте!',
        messageType: 'text',
        status: 'queued',
        sentAt: new Date(),
      });

      await expect(
        service.sendTextMessage({
          organizationId: orgId,
          dialogId,
          assignedPositionId: otherPositionId,
          text: 'Здравствуйте!',
        }),
      ).resolves.toMatchObject({ text: 'Здравствуйте!' });
    });

    it('sendMediaMessage: диалог назначен другой позиции — NotFoundException', async () => {
      mockDialog(ownerPositionId);

      await expect(
        service.sendMediaMessage({
          organizationId: orgId,
          dialogId,
          assignedPositionId: otherPositionId,
          media: { fileName: 'plan.pdf', url: 'https://example.test/plan.pdf' },
        }),
      ).rejects.toThrow('Диалог не найден');
      expect(messageRepo.create).not.toHaveBeenCalled();
    });

    it('linkDialogToCrm: диалог назначен другой позиции — NotFoundException, привязка не меняется', async () => {
      mockDialog(ownerPositionId);

      await expect(
        service.linkDialogToCrm({
          organizationId: orgId,
          dialogId,
          assignedPositionId: otherPositionId,
          leadId: new Types.ObjectId(),
          actorIdentityId: new Types.ObjectId(),
          correlationId: 'cor-link',
        }),
      ).rejects.toThrow('Диалог не найден');
      expect(dialogRepo.linkCrm).not.toHaveBeenCalled();
    });

    it('createTaskFromDialog: диалог назначен другой позиции — NotFoundException, задача не создаётся', async () => {
      mockDialog(ownerPositionId);

      await expect(
        service.createTaskFromDialog({
          organizationId: orgId,
          dialogId,
          assignedPositionId: otherPositionId,
          actorIdentityId: new Types.ObjectId(),
          actorPositionId: otherPositionId,
          title: 'Попытка обхода',
          correlationId: 'cor-task-2',
          idempotencyKey: 'idemp-2',
          idempotencyRequestBody: {},
        }),
      ).rejects.toThrow('Диалог не найден');
      expect(crmService.createTask).not.toHaveBeenCalled();
    });
  });

  describe('linkDialogToCrm: leadId/contactId/dealId проверяются на существование и принадлежность организации', () => {
    // ИСПРАВЛЕНО 11.09.2026: раньше leadId/contactId/dealId писались в
    // dialogRepository.linkCrm как есть, без единой проверки — диалог
    // можно было привязать к CRM-записи чужой организации, подобрав
    // произвольный ObjectId. Own-scope конкретной записи (например лида,
    // назначенного другому менеджеру) сюда намеренно не входит — это
    // отдельный вопрос, см. messenger-skeleton.md.
    const orgId = new Types.ObjectId();
    const dialogId = new Types.ObjectId();
    const ownerPositionId = new Types.ObjectId();

    beforeEach(() => {
      (dialogRepo.findByIdForOrganization as jest.Mock).mockResolvedValue({
        _id: dialogId,
        organizationId: orgId,
        platform: 'telegram',
        externalChatId: 'chat-77',
        name: 'Мария Клиент',
        assignedPositionId: ownerPositionId,
      });

      crmService.getLeadForOrganization = jest.fn();
      crmService.getContactForOrganization = jest.fn();
      crmService.getDealForOrganization = jest.fn();
    });

    it('leadId из чужой организации (или несуществующий) — NotFoundException, привязка не меняется', async () => {
      (crmService.getLeadForOrganization as jest.Mock).mockRejectedValue(new NotFoundException('Lead not found'));

      await expect(
        service.linkDialogToCrm({
          organizationId: orgId,
          dialogId,
          assignedPositionId: ownerPositionId,
          leadId: new Types.ObjectId(),
          actorIdentityId: new Types.ObjectId(),
          correlationId: 'cor-link-lead',
        }),
      ).rejects.toThrow('Lead not found');
      expect(dialogRepo.linkCrm).not.toHaveBeenCalled();
    });

    it('contactId из чужой организации (или несуществующий) — NotFoundException, привязка не меняется', async () => {
      (crmService.getContactForOrganization as jest.Mock).mockRejectedValue(
        new NotFoundException('Contact not found'),
      );

      await expect(
        service.linkDialogToCrm({
          organizationId: orgId,
          dialogId,
          assignedPositionId: ownerPositionId,
          contactId: new Types.ObjectId(),
          actorIdentityId: new Types.ObjectId(),
          correlationId: 'cor-link-contact',
        }),
      ).rejects.toThrow('Contact not found');
      expect(dialogRepo.linkCrm).not.toHaveBeenCalled();
    });

    it('dealId из чужой организации (или несуществующий) — NotFoundException, привязка не меняется', async () => {
      (crmService.getDealForOrganization as jest.Mock).mockRejectedValue(new NotFoundException('Deal not found'));

      await expect(
        service.linkDialogToCrm({
          organizationId: orgId,
          dialogId,
          assignedPositionId: ownerPositionId,
          dealId: new Types.ObjectId(),
          actorIdentityId: new Types.ObjectId(),
          correlationId: 'cor-link-deal',
        }),
      ).rejects.toThrow('Deal not found');
      expect(dialogRepo.linkCrm).not.toHaveBeenCalled();
    });

    it('свои leadId/contactId/dealId — проходят проверку, привязка выполняется', async () => {
      const leadId = new Types.ObjectId();
      const contactId = new Types.ObjectId();
      const dealId = new Types.ObjectId();
      (crmService.getLeadForOrganization as jest.Mock).mockResolvedValue({ _id: leadId } as never);
      (crmService.getContactForOrganization as jest.Mock).mockResolvedValue({ _id: contactId } as never);
      (crmService.getDealForOrganization as jest.Mock).mockResolvedValue({ _id: dealId } as never);
      (dialogRepo.linkCrm as jest.Mock).mockResolvedValue({
        _id: dialogId,
        organizationId: orgId,
        accountId: new Types.ObjectId(),
        platform: 'telegram',
        externalChatId: 'chat-77',
        name: 'Мария Клиент',
        assignedPositionId: ownerPositionId,
        unreadCount: 0,
        pinned: false,
        leadId,
        contactId,
        dealId,
      });

      const res = await service.linkDialogToCrm({
        organizationId: orgId,
        dialogId,
        assignedPositionId: ownerPositionId,
        leadId,
        contactId,
        dealId,
        actorIdentityId: new Types.ObjectId(),
        correlationId: 'cor-link-ok',
      });

      expect(crmService.getLeadForOrganization).toHaveBeenCalledWith(leadId, orgId);
      expect(crmService.getContactForOrganization).toHaveBeenCalledWith(contactId, orgId);
      expect(crmService.getDealForOrganization).toHaveBeenCalledWith(dealId, orgId);
      expect(res.leadId).toBe(leadId.toString());
      expect(res.contactId).toBe(contactId.toString());
      expect(res.dealId).toBe(dealId.toString());
    });
  });
});
