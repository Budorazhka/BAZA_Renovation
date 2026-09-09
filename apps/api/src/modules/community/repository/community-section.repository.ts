import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ClientSession } from 'mongoose';
import {
  CommunitySectionDocument,
} from '../schemas/community-section.schema';
import type { SeedSection } from '../community-seed-data';

@Injectable()
export class CommunitySectionRepository {
  constructor(
    @InjectModel(CommunitySectionDocument.name)
    private readonly model: Model<CommunitySectionDocument>,
  ) {}

  async listAll(session?: ClientSession): Promise<CommunitySectionDocument[]> {
    return this.model.find().sort({ order: 1 }).session(session ?? null).exec();
  }

  async findById(sectionId: string, session?: ClientSession): Promise<CommunitySectionDocument | null> {
    return this.model.findOne({ sectionId }).session(session ?? null).exec();
  }

  async incrementThreadCount(sectionId: string, delta: number, session?: ClientSession): Promise<void> {
    await this.model.updateOne({ sectionId }, { $inc: { threadCount: delta } }).session(session ?? null).exec();
  }

  async seedSystemSectionsIfEmpty(sections: SeedSection[], session?: ClientSession): Promise<void> {
    const count = await this.model.countDocuments().session(session ?? null);
    if (count > 0) return;

    for (const s of sections) {
      await this.model.updateOne(
        { sectionId: s.sectionId },
        {
          $setOnInsert: {
            sectionId: s.sectionId,
            name: s.name,
            kind: s.kind,
            group: s.group ?? null,
            icon: s.icon,
            description: s.description,
            order: s.order,
            threadCount: 0,
          },
        },
        { upsert: true, session: session ?? undefined },
      );
    }
  }
}
