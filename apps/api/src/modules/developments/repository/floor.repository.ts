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

  /**
   * organizationId — часть фильтра, не post-fetch проверка: тот же принцип,
   * что DevelopmentRepository.listForOrganization.
   */
  async listForBuilding(
    buildingId: Types.ObjectId,
    organizationId: Types.ObjectId,
  ): Promise<FloorDocument[]> {
    return this.model.find({ buildingId, organizationId }).sort({ floorNumber: 1 }).exec();
  }

  /**
   * chessboard.export: юнит хранит floorId, а в выгрузке нужен floorNumber —
   * этажи всех корпусов ЖК читаются одним запросом, чтобы не делать N+1 по
   * каждому юниту.
   */
  async listForBuildings(
    buildingIds: Types.ObjectId[],
    organizationId: Types.ObjectId,
  ): Promise<FloorDocument[]> {
    if (buildingIds.length === 0) {
      return [];
    }
    return this.model.find({ buildingId: { $in: buildingIds }, organizationId }).exec();
  }
}
