import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { PositionProfileDocument } from '../schemas/position-profile.schema';

export interface PositionProfileFields {
  phone?: string;
  hireDate?: string;
  birthDate?: string;
  department?: string;
  city?: string;
  telegram?: string;
  aboutMe?: string;
  aboutCompany?: string;
  skills?: string[];
  whatsapp?: string;
  vk?: string;
  instagram?: string;
  website?: string;
}

/**
 * Единственная точка доступа к коллекции position_profiles (ADR-002 требование 2).
 */
@Injectable()
export class PositionProfileRepository {
  constructor(
    @InjectModel(PositionProfileDocument.name) private readonly model: Model<PositionProfileDocument>,
  ) {}

  async findByPositionId(positionId: Types.ObjectId): Promise<PositionProfileDocument | null> {
    return this.model.findOne({ positionId }).exec();
  }

  async findByPositionIds(positionIds: Types.ObjectId[]): Promise<PositionProfileDocument[]> {
    return this.model.find({ positionId: { $in: positionIds } }).exec();
  }

  /**
   * teamApi.ts::create — новая позиция сразу с профилем, внутри той же
   * транзакции, что создание Position/Assignment (organizations.service.ts).
   */
  async create(
    positionId: Types.ObjectId,
    organizationId: Types.ObjectId,
    fields: PositionProfileFields,
    session?: ClientSession,
  ): Promise<void> {
    await this.model.create([{ positionId, organizationId, ...fields }], { session });
  }

  /**
   * teamApi.ts::update — upsert (не update-only): позиция могла быть
   * создана до появления этого прохода (assignOccupant/createVacantPosition
   * не создают profile-запись) — первый update для такой позиции должен
   * создать профиль, не провалиться отсутствием документа.
   */
  async upsertFields(
    positionId: Types.ObjectId,
    organizationId: Types.ObjectId,
    fields: Partial<PositionProfileFields>,
  ): Promise<void> {
    await this.model
      .updateOne({ positionId }, { $set: { ...fields, organizationId } }, { upsert: true })
      .exec();
  }
}
