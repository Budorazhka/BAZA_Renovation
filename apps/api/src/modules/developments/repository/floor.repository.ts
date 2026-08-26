import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { FloorDocument } from '../schemas/floor.schema';

/**
 * Единственная точка доступа к коллекции floors (ADR-002 требование 2).
 */
@Injectable()
export class FloorRepository {
  constructor(
    @InjectModel(FloorDocument.name) private readonly model: Model<FloorDocument>,
  ) {}

  async create(
    params: {
      buildingId: Types.ObjectId;
      sectionId?: Types.ObjectId;
      organizationId: Types.ObjectId;
      floorNumber: number;
      floorType?: string;
    },
    session?: ClientSession,
  ): Promise<FloorDocument> {
    const [doc] = await this.model.create([params], { session });
    return doc!;
  }

  async findByIdForOrganization(
    id: Types.ObjectId,
    organizationId: Types.ObjectId,
  ): Promise<FloorDocument | null> {
    return this.model.findOne({ _id: id, organizationId }).exec();
  }

  async listForBuilding(buildingId: Types.ObjectId): Promise<FloorDocument[]> {
    return this.model.find({ buildingId }).sort({ floorNumber: 1 }).exec();
  }
}
