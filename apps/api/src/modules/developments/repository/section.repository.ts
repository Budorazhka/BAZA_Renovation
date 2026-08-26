import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { SectionDocument } from '../schemas/section.schema';

/**
 * Единственная точка доступа к коллекции sections (ADR-002 требование 2).
 */
@Injectable()
export class SectionRepository {
  constructor(
    @InjectModel(SectionDocument.name) private readonly model: Model<SectionDocument>,
  ) {}

  async create(
    params: { buildingId: Types.ObjectId; organizationId: Types.ObjectId; name: string },
    session?: ClientSession,
  ): Promise<SectionDocument> {
    const [doc] = await this.model.create([params], { session });
    return doc!;
  }

  async findByIdForOrganization(
    id: Types.ObjectId,
    organizationId: Types.ObjectId,
  ): Promise<SectionDocument | null> {
    return this.model.findOne({ _id: id, organizationId }).exec();
  }

  async listForBuilding(buildingId: Types.ObjectId): Promise<SectionDocument[]> {
    return this.model.find({ buildingId }).sort({ _id: 1 }).exec();
  }
}
