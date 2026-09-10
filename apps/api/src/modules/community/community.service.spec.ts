import { Types } from 'mongoose';
import { CommunityService } from './community.service';
import { ErrorCode } from '../../shared/errors/error-codes';
import type { CommunitySectionRepository } from './repository/community-section.repository';
import type { CommunityThreadRepository } from './repository/community-thread.repository';
import type { CommunityReplyRepository } from './repository/community-reply.repository';
import type { CommunityEventRepository } from './repository/community-event.repository';
import type { IdempotencyService } from '../../shared/idempotency/idempotency.service';
import type { OutboxService } from '../outbox/outbox.service';
import type { CommunityThreadDocument } from './schemas/community-thread.schema';
import type { CommunityReplyDocument } from './schemas/community-reply.schema';
import type { CommunitySectionDocument } from './schemas/community-section.schema';

function makeTransactionConnection() {
  const session = {
    endSession: jest.fn().mockResolvedValue(undefined),
  };
  return {
    startSession: jest.fn().mockResolvedValue({
      ...session,
      withTransaction: async (work: (s: typeof session) => Promise<unknown>) => work(session),
    }),
  };
}

interface MockSectionRepo {
  listAll: jest.Mock;
  findById: jest.Mock;
  incrementThreadCount: jest.Mock;
  seedSystemSectionsIfEmpty: jest.Mock;
}

interface MockThreadRepo {
  findPaginated: jest.Mock;
  findById: jest.Mock;
  create: jest.Mock;
  update: jest.Mock;
  delete: jest.Mock;
  incrementViews: jest.Mock;
  toggleReaction: jest.Mock;
  incrementReplyCount: jest.Mock;
  updateExchangeStatus: jest.Mock;
  seedSystemThreadsIfEmpty: jest.Mock;
}

interface MockReplyRepo {
  findPaginated: jest.Mock;
  findById: jest.Mock;
  create: jest.Mock;
  update: jest.Mock;
  delete: jest.Mock;
  toggleReaction: jest.Mock;
  markAsBest: jest.Mock;
}

interface MockEventRepo {
  findUpcoming: jest.Mock;
  findById: jest.Mock;
  toggleAttendance: jest.Mock;
  seedSystemEventsIfEmpty: jest.Mock;
}

interface MockIdempotencyService {
  checkReplay: jest.Mock;
  record: jest.Mock;
}

interface MockOutboxService {
  publish: jest.Mock;
}

describe('CommunityService', () => {
  let service: CommunityService;
  let sectionRepo: MockSectionRepo;
  let threadRepo: MockThreadRepo;
  let replyRepo: MockReplyRepo;
  let eventRepo: MockEventRepo;
  let idempotencyService: MockIdempotencyService;
  let outboxService: MockOutboxService;

  const orgId = new Types.ObjectId();
  const positionId = new Types.ObjectId();
  const identityId = new Types.ObjectId();

  beforeEach(() => {
    sectionRepo = {
      listAll: jest.fn(),
      findById: jest.fn(),
      incrementThreadCount: jest.fn().mockResolvedValue(undefined),
      seedSystemSectionsIfEmpty: jest.fn().mockResolvedValue(undefined),
    };
    threadRepo = {
      findPaginated: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      incrementViews: jest.fn().mockResolvedValue(undefined),
      toggleReaction: jest.fn(),
      incrementReplyCount: jest.fn().mockResolvedValue(undefined),
      updateExchangeStatus: jest.fn(),
      seedSystemThreadsIfEmpty: jest.fn().mockResolvedValue(undefined),
    };
    replyRepo = {
      findPaginated: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      toggleReaction: jest.fn(),
      markAsBest: jest.fn(),
    };
    eventRepo = {
      findUpcoming: jest.fn(),
      findById: jest.fn(),
      toggleAttendance: jest.fn(),
      seedSystemEventsIfEmpty: jest.fn().mockResolvedValue(undefined),
    };
    idempotencyService = {
      checkReplay: jest.fn().mockResolvedValue(null),
      record: jest.fn().mockResolvedValue(undefined),
    };
    outboxService = {
      publish: jest.fn().mockResolvedValue(undefined),
    };

    service = new CommunityService(
      makeTransactionConnection() as never,
      sectionRepo as unknown as CommunitySectionRepository,
      threadRepo as unknown as CommunityThreadRepository,
      replyRepo as unknown as CommunityReplyRepository,
      eventRepo as unknown as CommunityEventRepository,
      idempotencyService as unknown as IdempotencyService,
      outboxService as unknown as OutboxService,
    );
  });

  // ─── Разделы ───────────────────────────────────────────────────────────────

  describe('sections', () => {
    it('возвращает список всех разделов', async () => {
      const mockSections = [
        { sectionId: 'market', name: 'Аналитика', group: 'Общее', order: 1 },
      ] as CommunitySectionDocument[];
      sectionRepo.listAll.mockResolvedValue(mockSections);

      const result = await service.getSections();
      expect(result.sections).toHaveLength(1);
      expect(result.sections![0]!.id).toBe('market');
      expect(sectionRepo.listAll).toHaveBeenCalled();
    });

    it('возвращает раздел по id', async () => {
      const mockSection = {
        sectionId: 'market',
        name: 'Аналитика',
      } as CommunitySectionDocument;
      sectionRepo.findById.mockResolvedValue(mockSection);

      const result = await service.getSection('market');
      expect(result.id).toBe('market');
    });

    it('выбрасывает NOT_FOUND, если раздел не найден', async () => {
      sectionRepo.findById.mockResolvedValue(null);

      await expect(service.getSection('unknown')).rejects.toMatchObject({
        code: ErrorCode.NOT_FOUND,
      });
    });
  });

  // ─── Темы (треды) ──────────────────────────────────────────────────────────

  describe('threads', () => {
    it('возвращает пагинированный список тем', async () => {
      const paginated = { items: [], total: 0, page: 1, pageSize: 20, hasMore: false };
      threadRepo.findPaginated.mockResolvedValue(paginated);

      const result = await service.listThreads({ page: 1, pageSize: 20 });
      expect(result.items).toEqual([]);
      expect(threadRepo.findPaginated).toHaveBeenCalledWith({}, 'active', 1, 20);
    });

    it('получает тему по id и инкрементирует просмотры', async () => {
      const mockThread = {
        threadId: 'thread-1',
        title: 'Test',
        authorIdentityId: identityId,
        authorPositionId: positionId,
        organizationId: orgId,
      } as CommunityThreadDocument;
      threadRepo.findById.mockResolvedValue(mockThread);

      const result = await service.getThread('thread-1');
      expect(result.id).toBe('thread-1');
      expect(threadRepo.incrementViews).toHaveBeenCalledWith('thread-1');
    });

    it('выбрасывает NOT_FOUND, если тема не найдена', async () => {
      threadRepo.findById.mockResolvedValue(null);

      await expect(service.getThread('thread-missing')).rejects.toMatchObject({
        code: ErrorCode.NOT_FOUND,
      });
    });

    it('создаёт тему, проверяет идемпотентность и публикует Outbox событие', async () => {
      sectionRepo.findById.mockResolvedValue({ sectionId: 'market', name: 'Рынок' });
      const mockCreated = {
        threadId: 't-123',
        title: 'Новая тема',
        sectionId: 'market',
        type: 'discussion',
        authorIdentityId: identityId,
        authorPositionId: positionId,
        organizationId: orgId,
      } as unknown as CommunityThreadDocument;
      threadRepo.create.mockResolvedValue(mockCreated);

      const result = await service.createThread({
        organizationId: orgId,
        positionId,
        identityId,
        idempotencyKey: 'idem-key-1',
        data: {
          type: 'discussion',
          sectionId: 'market',
          title: 'Новая тема',
          excerpt: 'Краткое описание',
          body: 'Полный текст темы',
        },
      });

      expect(idempotencyService.checkReplay).toHaveBeenCalledWith(
        expect.objectContaining({
          identityId,
          operation: 'createCommunityThread',
          key: 'idem-key-1',
        }),
      );
      expect(threadRepo.create).toHaveBeenCalled();
      expect(sectionRepo.incrementThreadCount).toHaveBeenCalledWith('market', 1, expect.anything());
      expect(idempotencyService.record).toHaveBeenCalled();
      expect(outboxService.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'CommunityThreadCreated',
          aggregateType: 'CommunityThread',
        }),
        expect.anything(),
      );
      expect(result.id).toBe('t-123');
    });

    it('возвращает сохранённый ответ при повторе idempotencyKey', async () => {
      const cached = { id: 'cached-thread' };
      idempotencyService.checkReplay.mockResolvedValue({ responseBody: cached });

      const result = await service.createThread({
        organizationId: orgId,
        positionId,
        identityId,
        idempotencyKey: 'dup-key',
        data: {
          type: 'discussion',
          sectionId: 'market',
          title: 'T',
          excerpt: 'E',
          body: 'B',
        },
      });

      expect(result).toEqual(cached);
      expect(threadRepo.create).not.toHaveBeenCalled();
    });

    it('обновляет тему автором', async () => {
      const mockThread = {
        threadId: 't-1',
        authorIdentityId: identityId,
        authorPositionId: positionId,
        organizationId: orgId,
      } as CommunityThreadDocument;
      threadRepo.findById.mockResolvedValue(mockThread);
      threadRepo.update.mockResolvedValue({ ...mockThread, title: 'Updated' });

      const result = await service.updateThread('t-1', identityId, orgId, { title: 'Updated' });
      expect(result.title).toBe('Updated');
    });

    it('запрещает редактировать чужую тему не-модератору', async () => {
      const mockThread = {
        threadId: 't-1',
        authorIdentityId: new Types.ObjectId(),
        organizationId: new Types.ObjectId(),
      } as CommunityThreadDocument;
      threadRepo.findById.mockResolvedValue(mockThread);

      await expect(
        service.updateThread('t-1', identityId, orgId, { title: 'Hacked' }),
      ).rejects.toMatchObject({
        code: ErrorCode.FORBIDDEN,
      });
    });

    it('переключает реакцию темы', async () => {
      threadRepo.findById.mockResolvedValue({ threadId: 't-1' });
      threadRepo.toggleReaction.mockResolvedValue({ reactions: 5, hasLiked: true });

      const result = await service.toggleThreadReaction('t-1', identityId);
      expect(result).toEqual({ reactions: 5, hasLiked: true });
    });

    it('закрепляет тему модератором своей организации', async () => {
      const mockThread = {
        threadId: 't-1',
        pinned: true,
        authorIdentityId: identityId,
        authorPositionId: positionId,
        organizationId: orgId,
      } as CommunityThreadDocument;
      threadRepo.findById.mockResolvedValue(mockThread);
      threadRepo.update.mockResolvedValue(mockThread);

      const result = await service.pinThread('t-1', orgId, true);
      expect(result.pinned).toBe(true);
    });

    it('запрещает закреплять чужую тему', async () => {
      const mockThread = {
        threadId: 't-1',
        organizationId: new Types.ObjectId(),
      } as CommunityThreadDocument;
      threadRepo.findById.mockResolvedValue(mockThread);

      await expect(service.pinThread('t-1', orgId, true)).rejects.toMatchObject({
        code: ErrorCode.FORBIDDEN,
      });
    });
  });

  // ─── Ответы (Replies) ────────────────────────────────────────────────────────

  describe('replies', () => {
    it('создаёт ответ и инкрементирует replyCount в теме', async () => {
      threadRepo.findById.mockResolvedValue({ threadId: 't-1', locked: false });
      const mockReply = {
        replyId: 'r-1',
        threadId: 't-1',
        body: 'Ответ',
        authorIdentityId: identityId,
        authorPositionId: positionId,
        organizationId: orgId,
      } as CommunityReplyDocument;
      replyRepo.create.mockResolvedValue(mockReply);

      const result = await service.createReply({
        threadId: 't-1',
        organizationId: orgId,
        positionId,
        identityId,
        idempotencyKey: 'idem-reply-1',
        data: { body: 'Ответ' },
      });

      expect(replyRepo.create).toHaveBeenCalled();
      expect(threadRepo.incrementReplyCount).toHaveBeenCalledWith('t-1', 1, expect.anything());
      expect(outboxService.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'CommunityReplyCreated',
          aggregateType: 'CommunityReply',
        }),
        expect.anything(),
      );
      expect(result.id).toBe('r-1');
    });

    it('принимает ответ как лучший автором темы', async () => {
      threadRepo.findById.mockResolvedValue({
        threadId: 't-1',
        authorIdentityId: identityId,
      });
      const mockAccepted = {
        replyId: 'r-1',
        threadId: 't-1',
        authorIdentityId: new Types.ObjectId(),
        authorPositionId: new Types.ObjectId(),
        organizationId: orgId,
        isBest: true,
      } as CommunityReplyDocument;
      replyRepo.markAsBest.mockResolvedValue(mockAccepted);
      threadRepo.update.mockResolvedValue({ threadId: 't-1', solved: true });

      const result = await service.acceptReply('t-1', 'r-1', identityId);
      expect(replyRepo.markAsBest).toHaveBeenCalledWith('t-1', 'r-1', expect.anything());
      expect(threadRepo.update).toHaveBeenCalledWith('t-1', { solved: true }, expect.anything());
      expect(result.isBest).toBe(true);
    });

    it('запрещает принимать ответ не-автору темы', async () => {
      threadRepo.findById.mockResolvedValue({
        threadId: 't-1',
        authorIdentityId: new Types.ObjectId(),
      });

      await expect(service.acceptReply('t-1', 'r-1', identityId)).rejects.toMatchObject({
        code: ErrorCode.FORBIDDEN,
      });
    });
  });

  // ─── Биржа MLS (Exchange) ───────────────────────────────────────────────────

  describe('exchange', () => {
    it('обновляет статус сделки и публикует Outbox событие', async () => {
      const mockThread = {
        threadId: 'ex-1',
        authorIdentityId: identityId,
        authorPositionId: positionId,
        organizationId: orgId,
        type: 'exchange',
        exchange: { status: 'open' },
      } as CommunityThreadDocument;
      threadRepo.findById.mockResolvedValue(mockThread);
      threadRepo.updateExchangeStatus.mockResolvedValue({
        ...mockThread,
        exchange: { status: 'closed' },
      });

      const result = await service.updateExchangeStatus('ex-1', identityId, false, 'closed');
      expect(result.exchange?.status).toBe('closed');
      expect(outboxService.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'ExchangeDealStatusChanged',
          aggregateType: 'CommunityThread',
        }),
        expect.anything(),
      );
    });
  });

  // ─── Мероприятия (Events) ───────────────────────────────────────────────────

  describe('events', () => {
    it('возвращает список мероприятий с флагом участия', async () => {
      eventRepo.findUpcoming.mockResolvedValue({
        items: [
          {
            eventId: 'ev-1',
            attendeeIdentityIds: [identityId],
            attendeeCount: 1,
          },
        ],
        total: 1,
      });

      const result = await service.listEvents({}, identityId);
      expect(result.items![0]!.isAttending).toBe(true);
    });

    it('переключает участие в мероприятии', async () => {
      eventRepo.findById.mockResolvedValue({ eventId: 'ev-1' });
      eventRepo.toggleAttendance.mockResolvedValue({
        attending: true,
        attendeeCount: 10,
      });

      const result = await service.toggleEventAttendance('ev-1', identityId);
      expect(result.attending).toBe(true);
    });
  });

  // ─── Лидерборд ─────────────────────────────────────────────────────────────

  describe('leaderboard', () => {
    it('возвращает лидеров сообщества', async () => {
      const result = await service.getLeaderboard();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toHaveProperty('trustIndex');
    });
  });
});
