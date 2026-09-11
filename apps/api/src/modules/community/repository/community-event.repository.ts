import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ClientSession, Types } from 'mongoose';
import { CommunityEventDocument } from '../schemas/community-event.schema';

@Injectable()
export class CommunityEventRepository {
  constructor(
    @InjectModel(CommunityEventDocument.name)
    private readonly model: Model<CommunityEventDocument>,
  ) {}

  async findUpcoming(page = 1, pageSize = 20, session?: ClientSession): Promise<{
    items: CommunityEventDocument[];
    total: number;
  }> {
    const skip = Math.max(0, (page - 1) * pageSize);
    const limit = Math.max(1, Math.min(pageSize, 50));

    const [items, total] = await Promise.all([
      this.model
        .find()
        .sort({ date: 1 })
        .skip(skip)
        .limit(limit)
        .session(session ?? null)
        .exec(),
      this.model.countDocuments().session(session ?? null).exec(),
    ]);

    return { items, total };
  }

  async findById(eventId: string, session?: ClientSession): Promise<CommunityEventDocument | null> {
    return this.model.findOne({ eventId }).session(session ?? null).exec();
  }

  /**
   * ИСПРАВЛЕНО 11.09.2026: тот же приём, что у CommunityThreadRepository.
   * toggleReaction — см. её комментарий. find → мутация → save() терял
   * запись на мероприятие при гонке конкурентных toggle; теперь атомарный
   * findOneAndUpdate с условным фильтром на обе ветки.
   */
  async toggleAttendance(
    eventId: string,
    identityId: Types.ObjectId,
    session?: ClientSession,
  ): Promise<{ attending: boolean; attendeeCount: number }> {
    const added = await this.model
      .findOneAndUpdate(
        { eventId, attendeeIdentityIds: { $ne: identityId } },
        { $addToSet: { attendeeIdentityIds: identityId }, $inc: { attendeeCount: 1 } },
        { new: true, session: session ?? null },
      )
      .exec();
    if (added) return { attending: true, attendeeCount: added.attendeeCount };

    const removed = await this.model
      .findOneAndUpdate(
        { eventId, attendeeIdentityIds: identityId },
        { $pull: { attendeeIdentityIds: identityId }, $inc: { attendeeCount: -1 } },
        { new: true, session: session ?? null },
      )
      .exec();
    if (removed) return { attending: false, attendeeCount: Math.max(0, removed.attendeeCount) };

    return { attending: false, attendeeCount: 0 };
  }

  /** Очистка выдуманных мероприятий бывшего засева по их фиксированным id (RETIRED_SEED_EVENT_IDS). */
  async deleteByEventIds(eventIds: readonly string[], session?: ClientSession): Promise<number> {
    if (eventIds.length === 0) return 0;
    const res = await this.model
      .deleteMany({ eventId: { $in: [...eventIds] } })
      .session(session ?? null)
      .exec();
    return res.deletedCount;
  }
}
