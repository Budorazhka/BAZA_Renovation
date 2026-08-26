import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AdminAccountDocument } from '../schemas/admin-account.schema';

/**
 * Единственная точка доступа к коллекции admin_accounts (ADR-002 требование 2).
 */
@Injectable()
export class AdminAccountRepository {
  constructor(
    @InjectModel(AdminAccountDocument.name) private readonly model: Model<AdminAccountDocument>,
  ) {}

  /**
   * AdminContextMiddleware: резолв AdminContext из активной admin-сессии.
   * Только status:'active' — деактивированный AdminAccount не должен
   * проходить дальше как валидный actor, даже если сессия технически жива.
   */
  async findActiveByIdentityId(identityId: Types.ObjectId): Promise<AdminAccountDocument | null> {
    return this.model.findOne({ identityId, status: 'active' }).exec();
  }

  async findById(id: Types.ObjectId): Promise<AdminAccountDocument | null> {
    return this.model.findOne({ _id: id }).exec();
  }

  async create(params: { identityId: Types.ObjectId; isSuperAdmin: boolean }): Promise<AdminAccountDocument> {
    return this.model.create(params);
  }
}
