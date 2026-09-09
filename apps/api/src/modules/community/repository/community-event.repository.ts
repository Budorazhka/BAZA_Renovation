import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ClientSession, Types } from 'mongoose';
import { CommunityEventDocument } from '../schemas/community-event.schema';
import type { SeedEvent } from '../community-seed-data';

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

  async seedSystemEventsIfEmpty(events: SeedEvent[], session?: ClientSession): Promise<void> {
    const count = await this.model.countDocuments().session(session ?? null);
    if (count > 0) return;

    for (const ev of events) {
      await this.model.updateOne(
        { eventId: ev.eventId },
        {
          $setOnInsert: {
            eventId: ev.eventId,
            title: ev.title,
            description: ev.description,
            date: ev.date,
            location: ev.location,
            format: ev.format,
            attendeeIdentityIds: [],
            attendeeCount: ev.attendeeCount,
          },
        },
        { upsert: true, session: session ?? undefined },
      );
    }
  }
}
