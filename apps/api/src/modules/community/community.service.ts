import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { ClientSession, Connection, Types } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { AppException } from '../../shared/errors/app-exception';
import { ErrorCode } from '../../shared/errors/error-codes';
import { IdempotencyService } from '../../shared/idempotency/idempotency.service';
import { runInTransaction } from '../../shared/transactions/run-in-transaction';
import { OutboxService } from '../outbox/outbox.service';
import { CommunitySectionRepository } from './repository/community-section.repository';
import { CommunityThreadRepository } from './repository/community-thread.repository';
import { CommunityReplyRepository } from './repository/community-reply.repository';
import { CommunityEventRepository } from './repository/community-event.repository';
import {
  CreateCommunityThreadDto,
  UpdateCommunityThreadDto,
  CreateCommunityReplyDto,
  UpdateCommunityReplyDto,
  ListCommunityThreadsQueryDto,
  ListCommunityRepliesQueryDto,
  ListCommunityEventsQueryDto,
} from './dto/community.dto';
import {
  SEED_COMMUNITY_SECTIONS,
  SEED_COMMUNITY_THREADS,
  SEED_COMMUNITY_EVENTS,
} from './community-seed-data';
import type { CommunitySectionDocument } from './schemas/community-section.schema';
import type {
  CommunityThreadDocument,
  AuthorSnapshot,
  ExchangeStatus,
} from './schemas/community-thread.schema';
import type { CommunityReplyDocument } from './schemas/community-reply.schema';
import type { CommunityEventDocument } from './schemas/community-event.schema';

export function toCommunitySectionDto(doc: CommunitySectionDocument) {
  return {
    id: doc.sectionId,
    name: doc.name,
    kind: doc.kind,
    group: doc.group ?? undefined,
    icon: doc.icon,
    description: doc.description,
    threads: doc.threadCount,
  };
}

export function toCommunityThreadDto(doc: CommunityThreadDocument) {
  return {
    id: doc.threadId,
    type: doc.type,
    sectionId: doc.sectionId,
    title: doc.title,
    excerpt: doc.excerpt,
    body: doc.body,
    authorId: doc.authorIdentityId ? doc.authorIdentityId.toHexString() : 'system',
    createdAt: doc.createdAt ? doc.createdAt.toISOString() : new Date().toISOString(),
    updatedAt: doc.updatedAt ? doc.updatedAt.toISOString() : new Date().toISOString(),
    views: doc.views,
    reactionCount: doc.reactions,
    replyCount: doc.replyCount,
    tags: doc.tags ?? [],
    pinned: doc.pinned ?? false,
    solved: doc.solved ?? false,
    locked: doc.locked ?? false,
    exchange: doc.exchange ?? null,
    author: doc.authorSnapshot,
  };
}

export function toCommunityReplyDto(doc: CommunityReplyDocument) {
  return {
    id: doc.replyId,
    threadId: doc.threadId,
    authorId: doc.authorIdentityId ? doc.authorIdentityId.toHexString() : 'system',
    createdAt: doc.createdAt ? doc.createdAt.toISOString() : new Date().toISOString(),
    updatedAt: doc.updatedAt ? doc.updatedAt.toISOString() : new Date().toISOString(),
    reactionCount: doc.reactions,
    isBest: doc.isBest ?? false,
    body: doc.body,
    author: doc.authorSnapshot,
  };
}

export function toCommunityEventDto(doc: CommunityEventDocument, currentIdentityId?: Types.ObjectId) {
  const isAttending = currentIdentityId
    ? (doc.attendeeIdentityIds ?? []).some((id) => id.equals(currentIdentityId))
    : false;
  return {
    id: doc.eventId,
    title: doc.title,
    description: doc.description,
    date: doc.date,
    location: doc.location,
    format: doc.format,
    attendees: doc.attendeeCount,
    isAttending,
  };
}

@Injectable()
export class CommunityService implements OnModuleInit {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly sectionRepository: CommunitySectionRepository,
    private readonly threadRepository: CommunityThreadRepository,
    private readonly replyRepository: CommunityReplyRepository,
    private readonly eventRepository: CommunityEventRepository,
    private readonly idempotencyService: IdempotencyService,
    private readonly outboxService: OutboxService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seedDefaultsIfEmpty();
  }

  async seedDefaultsIfEmpty(): Promise<void> {
    try {
      await this.sectionRepository.seedSystemSectionsIfEmpty(SEED_COMMUNITY_SECTIONS);
      const defaultId = new Types.ObjectId();
      await this.threadRepository.seedSystemThreadsIfEmpty(
        SEED_COMMUNITY_THREADS,
        defaultId,
        defaultId,
        defaultId,
      );
      await this.eventRepository.seedSystemEventsIfEmpty(SEED_COMMUNITY_EVENTS);
    } catch {
      // Ignored if replica set is not initialized yet in unit test contexts
    }
  }

  // ─── Разделы форума ──────────────────────────────────────────────────────────

  async getSections() {
    const sections = await this.sectionRepository.listAll();
    const groups = Array.from(
      new Set(
        sections
          .map((s) => s.group)
          .filter((g): g is string => typeof g === 'string' && g.length > 0),
      ),
    );
    return {
      sections: sections.map(toCommunitySectionDto),
      groups,
    };
  }

  async getSection(sectionId: string) {
    const section = await this.sectionRepository.findById(sectionId);
    if (!section) {
      throw new AppException(ErrorCode.NOT_FOUND, `Section '${sectionId}' not found`);
    }
    return toCommunitySectionDto(section);
  }

  // ─── Темы (треды) ──────────────────────────────────────────────────────────

  async listThreads(query: ListCommunityThreadsQueryDto) {
    const result = await this.threadRepository.findPaginated(
      {
        sectionId: query.section,
        type: query.type,
        tag: query.tag,
        search: query.search,
        exchangeIntent: query.exchangeIntent,
        exchangeSide: query.exchangeSide,
        exchangeStatus: query.exchangeStatus,
      },
      query.sort ?? 'active',
      query.page ?? 1,
      query.pageSize ?? 20,
    );

    return {
      items: result.items.map(toCommunityThreadDto),
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      hasMore: result.hasMore,
    };
  }

  async getThread(threadId: string) {
    const thread = await this.threadRepository.findById(threadId);
    if (!thread) {
      throw new AppException(ErrorCode.NOT_FOUND, `Thread '${threadId}' not found`);
    }
    // Async view increment
    this.threadRepository.incrementViews(threadId).catch(() => {});
    return toCommunityThreadDto(thread);
  }

  async createThread(params: {
    organizationId: Types.ObjectId;
    positionId: Types.ObjectId;
    identityId: Types.ObjectId;
    idempotencyKey?: string;
    data: CreateCommunityThreadDto;
    authorSnapshot?: AuthorSnapshot;
  }) {
    if (!params.idempotencyKey) {
      throw new AppException(ErrorCode.IDEMPOTENCY_KEY_REQUIRED, 'Idempotency-Key header is required');
    }

    const replay = await this.idempotencyService.checkReplay({
      identityId: params.identityId,
      operation: 'createCommunityThread',
      key: params.idempotencyKey,
      requestBody: params.data as unknown as Record<string, unknown>,
    });
    if (replay) {
      return replay.responseBody;
    }

    const section = await this.sectionRepository.findById(params.data.sectionId);
    if (!section) {
      throw new AppException(ErrorCode.NOT_FOUND, `Section '${params.data.sectionId}' not found`);
    }

    const threadId = `th-${Date.now()}-${randomUUID().slice(0, 8)}`;
    const excerpt =
      params.data.excerpt ||
      params.data.body.slice(0, 160).replace(/[#*_`]/g, '').trim();

    const snapshot: AuthorSnapshot = params.authorSnapshot ?? {
      name: 'Участник BAZA',
      company: 'Агентство недвижимости',
      segment: 'broker',
      role: 'member',
      badges: ['Участник'],
    };

    return runInTransaction(this.connection, async (session: ClientSession) => {
      const created = await this.threadRepository.create(
        {
          threadId,
          type: params.data.type,
          sectionId: params.data.sectionId,
          title: params.data.title,
          excerpt,
          body: params.data.body,
          authorIdentityId: params.identityId,
          authorPositionId: params.positionId,
          organizationId: params.organizationId,
          authorSnapshot: snapshot,
          tags: params.data.tags ?? [],
          pinned: params.data.pinned ?? false,
          exchange: params.data.exchange
            ? {
                intent: params.data.exchange.intent,
                side: params.data.exchange.side,
                dealKind: params.data.exchange.dealKind,
                location: params.data.exchange.location,
                amount: params.data.exchange.amount,
                commission: params.data.exchange.commission,
                deadline: params.data.exchange.deadline,
                status: params.data.exchange.status ?? 'open',
              }
            : undefined,
        },
        session,
      );

      await this.sectionRepository.incrementThreadCount(params.data.sectionId, 1, session);

      const response = toCommunityThreadDto(created);

      await this.idempotencyService.record(
        {
          identityId: params.identityId,
          operation: 'createCommunityThread',
          key: params.idempotencyKey!,
          requestBody: params.data as unknown as Record<string, unknown>,
          responseStatus: 201,
          responseBody: response as unknown as Record<string, unknown>,
        },
        session,
      );

      await this.outboxService.publish(
        {
          eventType: 'CommunityThreadCreated',
          aggregateType: 'CommunityThread',
          aggregateId: created._id,
          payload: {
            threadId: created.threadId,
            type: created.type,
            sectionId: created.sectionId,
            title: created.title,
            authorIdentityId: params.identityId.toHexString(),
            organizationId: params.organizationId.toHexString(),
          },
          deduplicationKey: `CommunityThread:${created.threadId}:created`,
        },
        session,
      );

      return response;
    });
  }

  async updateThread(
    threadId: string,
    identityId: Types.ObjectId,
    isModerator: boolean,
    data: UpdateCommunityThreadDto,
  ) {
    const thread = await this.threadRepository.findById(threadId);
    if (!thread) {
      throw new AppException(ErrorCode.NOT_FOUND, `Thread '${threadId}' not found`);
    }

    const isAuthor = thread.authorIdentityId.equals(identityId);
    if (!isAuthor && !isModerator) {
      throw new AppException(ErrorCode.FORBIDDEN, 'Only author or moderator can update thread');
    }

    const patch: Partial<Pick<CommunityThreadDocument, 'title' | 'excerpt' | 'body' | 'tags' | 'pinned' | 'solved' | 'locked' | 'exchange'>> = {};
    if (data.title !== undefined) patch.title = data.title;
    if (data.body !== undefined) patch.body = data.body;
    if (data.excerpt !== undefined) patch.excerpt = data.excerpt;
    if (data.tags !== undefined) patch.tags = data.tags;
    if (data.solved !== undefined) patch.solved = data.solved;
    if (isModerator) {
      if (data.pinned !== undefined) patch.pinned = data.pinned;
      if (data.locked !== undefined) patch.locked = data.locked;
    }
    if (data.exchange !== undefined) {
      patch.exchange = {
        intent: data.exchange.intent,
        side: data.exchange.side,
        dealKind: data.exchange.dealKind,
        location: data.exchange.location,
        amount: data.exchange.amount,
        commission: data.exchange.commission,
        deadline: data.exchange.deadline,
        status: data.exchange.status ?? 'open',
      };
    }

    const updated = await this.threadRepository.update(threadId, patch);
    return toCommunityThreadDto(updated!);
  }

  async deleteThread(threadId: string, identityId: Types.ObjectId, isModerator: boolean) {
    const thread = await this.threadRepository.findById(threadId);
    if (!thread) {
      throw new AppException(ErrorCode.NOT_FOUND, `Thread '${threadId}' not found`);
    }

    const isAuthor = thread.authorIdentityId.equals(identityId);
    if (!isAuthor && !isModerator) {
      throw new AppException(ErrorCode.FORBIDDEN, 'Only author or moderator can delete thread');
    }

    return runInTransaction(this.connection, async (session: ClientSession) => {
      const deleted = await this.threadRepository.delete(threadId, session);
      if (deleted) {
        await this.sectionRepository.incrementThreadCount(thread.sectionId, -1, session);
      }
      return { deleted };
    });
  }

  async toggleThreadReaction(threadId: string, identityId: Types.ObjectId) {
    const thread = await this.threadRepository.findById(threadId);
    if (!thread) {
      throw new AppException(ErrorCode.NOT_FOUND, `Thread '${threadId}' not found`);
    }
    return this.threadRepository.toggleReaction(threadId, identityId.toHexString());
  }

  async pinThread(threadId: string, pinned: boolean) {
    const updated = await this.threadRepository.update(threadId, { pinned });
    if (!updated) {
      throw new AppException(ErrorCode.NOT_FOUND, `Thread '${threadId}' not found`);
    }
    return toCommunityThreadDto(updated);
  }

  // ─── Ответы (Replies) ────────────────────────────────────────────────────────

  async listReplies(threadId: string, query: ListCommunityRepliesQueryDto) {
    const result = await this.replyRepository.findPaginatedByThread(
      threadId,
      query.sort ?? 'best_first',
      query.page ?? 1,
      query.pageSize ?? 20,
    );

    return {
      items: result.items.map(toCommunityReplyDto),
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      hasMore: result.hasMore,
    };
  }

  async createReply(params: {
    threadId: string;
    organizationId: Types.ObjectId;
    positionId: Types.ObjectId;
    identityId: Types.ObjectId;
    idempotencyKey?: string;
    data: CreateCommunityReplyDto;
    authorSnapshot?: AuthorSnapshot;
  }) {
    if (!params.idempotencyKey) {
      throw new AppException(ErrorCode.IDEMPOTENCY_KEY_REQUIRED, 'Idempotency-Key header is required');
    }

    const replay = await this.idempotencyService.checkReplay({
      identityId: params.identityId,
      operation: 'createCommunityReply',
      key: params.idempotencyKey,
      requestBody: { threadId: params.threadId, ...params.data } as Record<string, unknown>,
    });
    if (replay) {
      return replay.responseBody;
    }

    const thread = await this.threadRepository.findById(params.threadId);
    if (!thread) {
      throw new AppException(ErrorCode.NOT_FOUND, `Thread '${params.threadId}' not found`);
    }
    if (thread.locked) {
      throw new AppException(ErrorCode.FORBIDDEN, 'Thread is locked for new replies');
    }

    const replyId = `rep-${Date.now()}-${randomUUID().slice(0, 8)}`;
    const snapshot: AuthorSnapshot = params.authorSnapshot ?? {
      name: 'Участник BAZA',
      company: 'Агентство недвижимости',
      segment: 'broker',
      role: 'member',
      badges: ['Участник'],
    };

    return runInTransaction(this.connection, async (session: ClientSession) => {
      const created = await this.replyRepository.create(
        {
          replyId,
          threadId: params.threadId,
          authorIdentityId: params.identityId,
          authorPositionId: params.positionId,
          organizationId: params.organizationId,
          authorSnapshot: snapshot,
          body: params.data.body,
        },
        session,
      );

      await this.threadRepository.incrementReplyCount(params.threadId, 1, session);

      const response = toCommunityReplyDto(created);

      await this.idempotencyService.record(
        {
          identityId: params.identityId,
          operation: 'createCommunityReply',
          key: params.idempotencyKey!,
          requestBody: { threadId: params.threadId, ...params.data } as Record<string, unknown>,
          responseStatus: 201,
          responseBody: response as unknown as Record<string, unknown>,
        },
        session,
      );

      await this.outboxService.publish(
        {
          eventType: 'CommunityReplyCreated',
          aggregateType: 'CommunityReply',
          aggregateId: created._id,
          payload: {
            replyId: created.replyId,
            threadId: created.threadId,
            authorIdentityId: params.identityId.toHexString(),
            organizationId: params.organizationId.toHexString(),
          },
          deduplicationKey: `CommunityReply:${created.replyId}:created`,
        },
        session,
      );

      return response;
    });
  }

  async updateReply(
    replyId: string,
    identityId: Types.ObjectId,
    isModerator: boolean,
    data: UpdateCommunityReplyDto,
  ) {
    const reply = await this.replyRepository.findById(replyId);
    if (!reply) {
      throw new AppException(ErrorCode.NOT_FOUND, `Reply '${replyId}' not found`);
    }

    const isAuthor = reply.authorIdentityId.equals(identityId);
    if (!isAuthor && !isModerator) {
      throw new AppException(ErrorCode.FORBIDDEN, 'Only author or moderator can update reply');
    }

    const updated = await this.replyRepository.update(replyId, data.body);
    return toCommunityReplyDto(updated!);
  }

  async deleteReply(replyId: string, identityId: Types.ObjectId, isModerator: boolean) {
    const reply = await this.replyRepository.findById(replyId);
    if (!reply) {
      throw new AppException(ErrorCode.NOT_FOUND, `Reply '${replyId}' not found`);
    }

    const isAuthor = reply.authorIdentityId.equals(identityId);
    if (!isAuthor && !isModerator) {
      throw new AppException(ErrorCode.FORBIDDEN, 'Only author or moderator can delete reply');
    }

    return runInTransaction(this.connection, async (session: ClientSession) => {
      const deleted = await this.replyRepository.delete(replyId, session);
      if (deleted) {
        await this.threadRepository.incrementReplyCount(reply.threadId, -1, session);
      }
      return { deleted };
    });
  }

  async toggleReplyReaction(replyId: string, identityId: Types.ObjectId) {
    const reply = await this.replyRepository.findById(replyId);
    if (!reply) {
      throw new AppException(ErrorCode.NOT_FOUND, `Reply '${replyId}' not found`);
    }
    return this.replyRepository.toggleReaction(replyId, identityId.toHexString());
  }

  async acceptReply(threadId: string, replyId: string, identityId: Types.ObjectId) {
    const thread = await this.threadRepository.findById(threadId);
    if (!thread) {
      throw new AppException(ErrorCode.NOT_FOUND, `Thread '${threadId}' not found`);
    }

    const isAuthor = thread.authorIdentityId.equals(identityId);
    if (!isAuthor) {
      throw new AppException(ErrorCode.FORBIDDEN, 'Only thread author can accept answer');
    }

    return runInTransaction(this.connection, async (session: ClientSession) => {
      const accepted = await this.replyRepository.markAsBest(threadId, replyId, session);
      if (!accepted) {
        throw new AppException(ErrorCode.NOT_FOUND, `Reply '${replyId}' not found`);
      }
      await this.threadRepository.update(threadId, { solved: true }, session);
      return toCommunityReplyDto(accepted);
    });
  }

  // ─── Биржа сделок MLS (Exchange) ─────────────────────────────────────────────

  async listExchangeDeals(query: ListCommunityThreadsQueryDto) {
    const exchangeQuery: ListCommunityThreadsQueryDto = {
      ...query,
      type: 'exchange',
    };
    return this.listThreads(exchangeQuery);
  }

  async updateExchangeStatus(
    threadId: string,
    identityId: Types.ObjectId,
    isModerator: boolean,
    status: ExchangeStatus,
  ) {
    const thread = await this.threadRepository.findById(threadId);
    if (!thread || thread.type !== 'exchange') {
      throw new AppException(ErrorCode.NOT_FOUND, `Exchange deal '${threadId}' not found`);
    }

    const isAuthor = thread.authorIdentityId.equals(identityId);
    if (!isAuthor && !isModerator) {
      throw new AppException(ErrorCode.FORBIDDEN, 'Only author or moderator can update exchange status');
    }

    return runInTransaction(this.connection, async (session: ClientSession) => {
      const updated = await this.threadRepository.updateExchangeStatus(threadId, status, session);

      await this.outboxService.publish(
        {
          eventType: 'ExchangeDealStatusChanged',
          aggregateType: 'CommunityThread',
          aggregateId: thread._id,
          payload: {
            threadId,
            status,
            previousStatus: thread.exchange?.status ?? 'open',
            updatedByIdentityId: identityId.toHexString(),
          },
          deduplicationKey: `ExchangeDeal:${threadId}:${status}`,
        },
        session,
      );

      return toCommunityThreadDto(updated!);
    });
  }

  // ─── Мероприятия (Events) ────────────────────────────────────────────────────

  async listEvents(query: ListCommunityEventsQueryDto, currentIdentityId?: Types.ObjectId) {
    const { items, total } = await this.eventRepository.findUpcoming(
      query.page ?? 1,
      query.pageSize ?? 20,
    );

    return {
      items: items.map((ev) => toCommunityEventDto(ev, currentIdentityId)),
      total,
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 20,
    };
  }

  async getEvent(eventId: string, currentIdentityId?: Types.ObjectId) {
    const ev = await this.eventRepository.findById(eventId);
    if (!ev) {
      throw new AppException(ErrorCode.NOT_FOUND, `Event '${eventId}' not found`);
    }
    return toCommunityEventDto(ev, currentIdentityId);
  }

  async toggleEventAttendance(eventId: string, currentIdentityId: Types.ObjectId) {
    const ev = await this.eventRepository.findById(eventId);
    if (!ev) {
      throw new AppException(ErrorCode.NOT_FOUND, `Event '${eventId}' not found`);
    }
    return this.eventRepository.toggleAttendance(eventId, currentIdentityId);
  }

  // ─── Лидерборд и статистика ──────────────────────────────────────────────────

  async getLeaderboard() {
    return [
      {
        id: 'm1',
        name: 'Алексей Смирнов',
        company: 'Grand Realty',
        segment: 'broker',
        role: 'expert',
        city: 'Тбилиси',
        trustIndex: 98,
        solvedQuestions: 34,
        cobrokingDeals: 18,
        eventsYtd: 6,
        reactionsReceived: 412,
        badges: ['Топ брокер', 'Эксперт'],
      },
      {
        id: 'm2',
        name: 'Георгий Мамедов',
        company: 'GeoPrime Realty',
        segment: 'broker',
        role: 'expert',
        city: 'Батуми',
        trustIndex: 95,
        solvedQuestions: 29,
        cobrokingDeals: 15,
        eventsYtd: 5,
        reactionsReceived: 380,
        badges: ['Эксперт · право'],
      },
      {
        id: 'm3',
        name: 'Елена Васильева',
        company: 'Invest Realty Pro',
        segment: 'agent',
        role: 'member',
        city: 'Батуми',
        trustIndex: 92,
        solvedQuestions: 19,
        cobrokingDeals: 12,
        eventsYtd: 4,
        reactionsReceived: 295,
        badges: ['MLS Участник'],
      },
    ];
  }
}
