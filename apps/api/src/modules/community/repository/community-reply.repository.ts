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

  async toggleReaction(
    replyId: string,
    userId: string,
    session?: ClientSession,
  ): Promise<{ reactions: number; reacted: boolean }> {
    const reply = await this.model.findOne({ replyId }).session(session ?? null).exec();
    if (!reply) return { reactions: 0, reacted: false };

    const hasReacted = reply.reactionUserIds?.includes(userId) ?? false;
    if (hasReacted) {
      reply.reactionUserIds = reply.reactionUserIds.filter((id) => id !== userId);
      reply.reactions = Math.max(0, reply.reactions - 1);
    } else {
      if (!reply.reactionUserIds) reply.reactionUserIds = [];
      reply.reactionUserIds.push(userId);
      reply.reactions += 1;
    }

    await reply.save({ session });
    return { reactions: reply.reactions, reacted: !hasReacted };
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

    // Mark current reply as best
    return this.model
      .findOneAndUpdate({ replyId }, { $set: { isBest: true } }, { new: true, session: session ?? null })
      .exec();
  }
}
