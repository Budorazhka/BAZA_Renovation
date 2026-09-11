import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ClientSession, Types } from 'mongoose';
import { CommunityReplyDocument } from '../schemas/community-reply.schema';
import type { PaginatedResult } from './community-thread.repository';

@Injectable()
export class CommunityReplyRepository {
  constructor(
    @InjectModel(CommunityReplyDocument.name)
    private readonly model: Model<CommunityReplyDocument>,
  ) {}

  async findPaginatedByThread(
    threadId: string,
    sort: 'newest' | 'oldest' | 'best_first' = 'best_first',
    page = 1,
    pageSize = 20,
    session?: ClientSession,
  ): Promise<PaginatedResult<CommunityReplyDocument>> {
    const query = { threadId };
    const sortOptions: Record<string, 1 | -1> = {};

    if (sort === 'best_first') {
      sortOptions.isBest = -1;
      sortOptions.reactions = -1;
      sortOptions.createdAt = 1;
    } else if (sort === 'newest') {
      sortOptions.createdAt = -1;
    } else {
      // oldest
      sortOptions.createdAt = 1;
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

  async findById(replyId: string, session?: ClientSession): Promise<CommunityReplyDocument | null> {
    return this.model.findOne({ replyId }).session(session ?? null).exec();
  }

  async create(
    params: {
      replyId: string;
      threadId: string;
      authorIdentityId: Types.ObjectId;
      authorPositionId: Types.ObjectId;
      organizationId: Types.ObjectId;
      authorSnapshot: CommunityReplyDocument['authorSnapshot'];
      body: string;
    },
    session?: ClientSession,
  ): Promise<CommunityReplyDocument> {
    const [created] = await this.model.create(
      [
        {
          replyId: params.replyId,
          threadId: params.threadId,
          authorIdentityId: params.authorIdentityId,
          authorPositionId: params.authorPositionId,
          organizationId: params.organizationId,
          authorSnapshot: params.authorSnapshot,
          body: params.body,
          reactions: 0,
          reactionUserIds: [],
          isBest: false,
        },
      ],
      { session: session ?? undefined },
    );
    return created!;
  }

  async update(replyId: string, body: string, session?: ClientSession): Promise<CommunityReplyDocument | null> {
    return this.model
      .findOneAndUpdate({ replyId }, { $set: { body } }, { new: true, session: session ?? null })
      .exec();
  }

  async delete(replyId: string, session?: ClientSession): Promise<boolean> {
    const res = await this.model.deleteOne({ replyId }).session(session ?? null).exec();
    return res.deletedCount > 0;
  }

  /** Ответы к удалённым темам бывшего засева: без темы до них не добраться. */
  async deleteByThreadIds(threadIds: readonly string[], session?: ClientSession): Promise<number> {
    if (threadIds.length === 0) return 0;
    const res = await this.model
      .deleteMany({ threadId: { $in: [...threadIds] } })
      .session(session ?? null)
      .exec();
    return res.deletedCount;
  }

  /**
   * ИСПРАВЛЕНО 11.09.2026: тот же приём, что у CommunityThreadRepository.
   * toggleReaction — см. её комментарий. find → мутация → save() терял
   * реакцию при гонке конкурентных toggle; теперь атомарный
   * findOneAndUpdate с условным фильтром на обе ветки.
   */
  async toggleReaction(
    replyId: string,
    userId: string,
    session?: ClientSession,
  ): Promise<{ reactions: number; reacted: boolean }> {
    const added = await this.model
      .findOneAndUpdate(
        { replyId, reactionUserIds: { $ne: userId } },
        { $addToSet: { reactionUserIds: userId }, $inc: { reactions: 1 } },
        { new: true, session: session ?? null },
      )
      .exec();
    if (added) return { reactions: added.reactions, reacted: true };

    const removed = await this.model
      .findOneAndUpdate(
        { replyId, reactionUserIds: userId },
        { $pull: { reactionUserIds: userId }, $inc: { reactions: -1 } },
        { new: true, session: session ?? null },
      )
      .exec();
    if (removed) return { reactions: Math.max(0, removed.reactions), reacted: false };

    return { reactions: 0, reacted: false };
  }

  async markAsBest(
    threadId: string,
    replyId: string,
    session?: ClientSession,
  ): Promise<CommunityReplyDocument | null> {
    // Reset previously accepted best reply in this thread
    await this.model
      .updateMany({ threadId, isBest: true }, { $set: { isBest: false } })
      .session(session ?? null)
      .exec();

    // Mark current reply as best. ИСПРАВЛЕНО 10.09.2026: раньше искали только
    // по {replyId} без threadId — можно было передать replyId из ЧУЖОЙ темы и
    // получить в исходной теме два "лучших ответа" одновременно.
    return this.model
      .findOneAndUpdate({ replyId, threadId }, { $set: { isBest: true } }, { new: true, session: session ?? null })
      .exec();
  }
}
