import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ClientSession, FilterQuery, Types } from 'mongoose';
import {
  CommunityThreadDocument,
  type ExchangeStatus,
  type ThreadType,
  type ExchangeIntent,
  type ExchangeSide,
} from '../schemas/community-thread.schema';
import type { SeedThread } from '../community-seed-data';

export interface ListThreadsFilter {
  sectionId?: string;
  type?: ThreadType;
  tag?: string;
  search?: string;
  authorIdentityId?: Types.ObjectId;
  exchangeIntent?: ExchangeIntent;
  exchangeSide?: ExchangeSide;
  exchangeStatus?: ExchangeStatus;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

@Injectable()
export class CommunityThreadRepository {
  constructor(
    @InjectModel(CommunityThreadDocument.name)
    private readonly model: Model<CommunityThreadDocument>,
  ) {}

  async findPaginated(
    filter: ListThreadsFilter,
    sort: 'active' | 'new' | 'unanswered' = 'active',
    page = 1,
    pageSize = 20,
    session?: ClientSession,
  ): Promise<PaginatedResult<CommunityThreadDocument>> {
    const query: FilterQuery<CommunityThreadDocument> = {};

    if (filter.sectionId) query.sectionId = filter.sectionId;
    if (filter.type) query.type = filter.type;
    if (filter.tag) query.tags = filter.tag;
    if (filter.authorIdentityId) query.authorIdentityId = filter.authorIdentityId;
    if (filter.exchangeIntent) query['exchange.intent'] = filter.exchangeIntent;
    if (filter.exchangeSide) query['exchange.side'] = filter.exchangeSide;
    if (filter.exchangeStatus) query['exchange.status'] = filter.exchangeStatus;

    if (filter.search) {
      const escaped = filter.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.$or = [
        { title: { $regex: escaped, $options: 'i' } },
        { excerpt: { $regex: escaped, $options: 'i' } },
        { body: { $regex: escaped, $options: 'i' } },
        { tags: { $regex: escaped, $options: 'i' } },
      ];
    }

    if (sort === 'unanswered') {
      query.replyCount = 0;
    }

    const sortOptions: Record<string, 1 | -1> = { pinned: -1 };
    if (sort === 'new') {
      sortOptions.createdAt = -1;
    } else {
      // 'active' or 'unanswered'
      sortOptions.updatedAt = -1;
    }

    const skip = Math.max(0, (page - 1) * pageSize);
    const limit = Math.max(1, Math.min(pageSize, 100));

    const [items, total] = await Promise.all([
      this.model
        .find(query)
        .sort(sortOptions)
        .skip(skip)
        .limit(limit)
        .session(session ?? null)
        .exec(),
      this.model.countDocuments(query).session(session ?? null).exec(),
    ]);

    return {
      items,
      total,
      page,
      pageSize: limit,
      hasMore: skip + items.length < total,
    };
  }

  async findById(threadId: string, session?: ClientSession): Promise<CommunityThreadDocument | null> {
    return this.model.findOne({ threadId }).session(session ?? null).exec();
  }

  async create(
    params: {
      threadId: string;
      type: ThreadType;
      sectionId: string;
      title: string;
      excerpt: string;
      body: string;
      authorIdentityId: Types.ObjectId;
      authorPositionId: Types.ObjectId;
      organizationId: Types.ObjectId;
      authorSnapshot: CommunityThreadDocument['authorSnapshot'];
      tags?: string[];
      pinned?: boolean;
      exchange?: CommunityThreadDocument['exchange'];
    },
    session?: ClientSession,
  ): Promise<CommunityThreadDocument> {
    const [created] = await this.model.create(
      [
        {
          threadId: params.threadId,
          type: params.type,
          sectionId: params.sectionId,
          title: params.title,
          excerpt: params.excerpt,
          body: params.body,
          authorIdentityId: params.authorIdentityId,
          authorPositionId: params.authorPositionId,
          organizationId: params.organizationId,
          authorSnapshot: params.authorSnapshot,
          tags: params.tags ?? [],
          pinned: params.pinned ?? false,
          solved: false,
          locked: false,
          views: 0,
          reactions: 0,
          reactionUserIds: [],
          replyCount: 0,
          exchange: params.exchange ?? null,
        },
      ],
      { session: session ?? undefined },
    );
    return created!;
  }

  async update(
    threadId: string,
    patch: Partial<Pick<CommunityThreadDocument, 'title' | 'excerpt' | 'body' | 'tags' | 'pinned' | 'solved' | 'locked' | 'exchange'>>,
    session?: ClientSession,
  ): Promise<CommunityThreadDocument | null> {
    return this.model
      .findOneAndUpdate({ threadId }, { $set: patch }, { new: true, session: session ?? null })
      .exec();
  }

  async delete(threadId: string, session?: ClientSession): Promise<boolean> {
    const res = await this.model.deleteOne({ threadId }).session(session ?? null).exec();
    return res.deletedCount > 0;
  }

  async incrementViews(threadId: string, session?: ClientSession): Promise<void> {
    await this.model.updateOne({ threadId }, { $inc: { views: 1 } }).session(session ?? null).exec();
  }

  async incrementReplyCount(threadId: string, delta: number, session?: ClientSession): Promise<void> {
    await this.model
      .updateOne({ threadId }, { $inc: { replyCount: delta }, $set: { updatedAt: new Date() } })
      .session(session ?? null)
      .exec();
  }

  async toggleReaction(
    threadId: string,
    userId: string,
    session?: ClientSession,
  ): Promise<{ reactions: number; reacted: boolean }> {
    const thread = await this.model.findOne({ threadId }).session(session ?? null).exec();
    if (!thread) return { reactions: 0, reacted: false };

    const hasReacted = thread.reactionUserIds?.includes(userId) ?? false;
    if (hasReacted) {
      thread.reactionUserIds = thread.reactionUserIds.filter((id) => id !== userId);
      thread.reactions = Math.max(0, thread.reactions - 1);
    } else {
      if (!thread.reactionUserIds) thread.reactionUserIds = [];
      thread.reactionUserIds.push(userId);
      thread.reactions += 1;
    }

    await thread.save({ session });
    return { reactions: thread.reactions, reacted: !hasReacted };
  }

  async updateExchangeStatus(
    threadId: string,
    status: ExchangeStatus,
    session?: ClientSession,
  ): Promise<CommunityThreadDocument | null> {
    return this.model
      .findOneAndUpdate(
        { threadId, type: 'exchange' },
        { $set: { 'exchange.status': status } },
        { new: true, session: session ?? null },
      )
      .exec();
  }

  async seedSystemThreadsIfEmpty(
    threads: SeedThread[],
    defaultIdentityId: Types.ObjectId,
    defaultOrgId: Types.ObjectId,
    defaultPositionId: Types.ObjectId,
    session?: ClientSession,
  ): Promise<void> {
    const count = await this.model.countDocuments().session(session ?? null);
    if (count > 0) return;

    for (const t of threads) {
      await this.model.updateOne(
        { threadId: t.threadId },
        {
          $setOnInsert: {
            threadId: t.threadId,
            type: t.type,
            sectionId: t.sectionId,
            title: t.title,
            excerpt: t.excerpt,
            body: t.body,
            authorIdentityId: defaultIdentityId,
            authorPositionId: defaultPositionId,
            organizationId: defaultOrgId,
            authorSnapshot: t.authorSnapshot,
            views: t.views,
            reactions: t.reactions,
            reactionUserIds: [],
            replyCount: t.replyCount,
            tags: t.tags,
            pinned: t.pinned,
            solved: t.solved,
            locked: false,
            exchange: t.exchange ?? null,
          },
        },
        { upsert: true, session: session ?? undefined },
      );
    }
  }
}
