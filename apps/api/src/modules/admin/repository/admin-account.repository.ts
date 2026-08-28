import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
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

  async create(
    params: { identityId: Types.ObjectId; isSuperAdmin: boolean },
    session?: ClientSession,
  ): Promise<AdminAccountDocument> {
    const [account] = await this.model.create([params], { session });
    return account!;
  }

  /**
   * GET /admin/accounts (admin-web accounts screen) — тот же
   * cursor+limit+1 паттерн, что MarketplacePublicationRepository.listForAdmin
   * (admin-publication.service.ts), для единообразия пагинации по всему
   * Admin API. Сортировка по _id (монотонно растёт с созданием) — тот же
   * принцип, что публикации.
   */
  async list(params: { cursor?: Types.ObjectId; limit: number }): Promise<AdminAccountDocument[]> {
    const filter = params.cursor ? { _id: { $gt: params.cursor } } : {};
    return this.model.find(filter).sort({ _id: 1 }).limit(params.limit).exec();
  }
}
