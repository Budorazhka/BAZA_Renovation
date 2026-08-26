import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { FloorPlanDocument, GeoPolygon2D } from '../schemas/floor-plan.schema';

/**
 * Единственная точка доступа к коллекции floor_plans (ADR-002 требование 2).
 */
@Injectable()
export class FloorPlanRepository {
  constructor(
    @InjectModel(FloorPlanDocument.name) private readonly model: Model<FloorPlanDocument>,
  ) {}

  async create(params: {
    buildingId: Types.ObjectId;
    organizationId: Types.ObjectId;
    name: string;
    rooms: number;
    area: number;
    isEuro?: boolean;
    imageAssetId?: Types.ObjectId;
    tags?: string[];
    polygon?: GeoPolygon2D;
  }): Promise<FloorPlanDocument> {
    const doc = await this.model.create({ ...params, tags: params.tags ?? [] });
    return doc;
  }

  async findByIdForOrganization(
    id: Types.ObjectId,
    organizationId: Types.ObjectId,
  ): Promise<FloorPlanDocument | null> {
    return this.model.findOne({ _id: id, organizationId }).exec();
  }
}
