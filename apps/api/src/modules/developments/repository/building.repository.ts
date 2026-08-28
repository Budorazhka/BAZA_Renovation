import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { BuildingDocument, GeoPolygon } from '../schemas/building.schema';

/**
 * Единственная точка доступа к коллекции buildings (ADR-002 требование 2).
 */
@Injectable()
export class BuildingRepository {
  constructor(
    @InjectModel(BuildingDocument.name) private readonly model: Model<BuildingDocument>,
  ) {}

  async create(
    params: {
      developmentId: Types.ObjectId;
      organizationId: Types.ObjectId;
      name: string;
      floorsCount: number;
      startDate?: Date;
      completionDate?: Date;
      polygon?: GeoPolygon;
    },
    session?: ClientSession,
  ): Promise<BuildingDocument> {
    const [doc] = await this.model.create([params], { session });
    return doc!;
  }

  async findByIdForOrganization(
    id: Types.ObjectId,
    organizationId: Types.ObjectId,
  ): Promise<BuildingDocument | null> {
    return this.model.findOne({ _id: id, organizationId }).exec();
  }

  /**
   * organizationId — часть фильтра, не post-fetch проверка: find() без
   * tenant-фильтра вернул бы buildings любой организации по developmentId
   * (IDOR), тот же принцип, что DevelopmentRepository.listForOrganization.
   */
  async listForDevelopment(
    developmentId: Types.ObjectId,
    organizationId: Types.ObjectId,
  ): Promise<BuildingDocument[]> {
    return this.model.find({ developmentId, organizationId }).sort({ _id: 1 }).exec();
  }
}
