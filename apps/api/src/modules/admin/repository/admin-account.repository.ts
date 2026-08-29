import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { AdminAccountDocument, type AdminAccountStatus } from '../schemas/admin-account.schema';

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

  /**
   * AdminAccountService.deactivateAdminAccount: "запретить деактивацию
   * последнего активного super_admin" — считается ДО деактивации, внутри
   * той же транзакции (см. вызывающий код), чтобы гонка "два одновременных
   * deactivate на двух последних super_admin" не оставила систему без
   * единого active super_admin (MongoDB transaction snapshot isolation —
   * второй commit увидит уже обновлённый count и откатится по write
   * conflict, retry в runInTransaction переоценит инвариант заново).
   */
  async countActiveSuperAdmins(session?: ClientSession): Promise<number> {
    return this.model.countDocuments({ status: 'active', isSuperAdmin: true }, { session }).exec();
  }

  /**
   * Деактивация/реактивация — идемпотентны на уровне вызывающего кода
   * (AdminAccountService проверяет текущий status ДО вызова и возвращает
   * no-op, если уже в целевом состоянии), но сам update здесь всегда
   * условный на текущий status в фильтре — defense in depth против гонки
   * между проверкой и записью внутри одной транзакции.
   */
  async updateStatus(
    id: Types.ObjectId,
    params: { from: AdminAccountStatus; to: AdminAccountStatus },
    session?: ClientSession,
  ): Promise<{ modifiedCount: number }> {
    const result = await this.model
      .updateOne({ _id: id, status: params.from }, { $set: { status: params.to } }, { session })
      .exec();
    return { modifiedCount: result.modifiedCount };
  }
}
