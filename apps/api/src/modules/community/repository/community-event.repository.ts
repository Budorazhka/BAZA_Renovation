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

  async toggleAttendance(
    eventId: string,
    identityId: Types.ObjectId,
    session?: ClientSession,
  ): Promise<{ attending: boolean; attendeeCount: number }> {
    const event = await this.model.findOne({ eventId }).session(session ?? null).exec();
    if (!event) return { attending: false, attendeeCount: 0 };

    const idx = event.attendeeIdentityIds.findIndex((id) => id.equals(identityId));
    let attending = false;
    if (idx >= 0) {
      event.attendeeIdentityIds.splice(idx, 1);
      event.attendeeCount = Math.max(0, event.attendeeCount - 1);
      attending = false;
    } else {
      event.attendeeIdentityIds.push(identityId);
      event.attendeeCount += 1;
      attending = true;
    }

    await event.save({ session });
    return { attending, attendeeCount: event.attendeeCount };
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
