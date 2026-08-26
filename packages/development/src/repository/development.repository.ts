import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { DevelopmentDocument, DevelopmentLocation, DevelopmentContact } from '../schemas/development.schema';

/**
 * Единственная точка доступа к коллекции developments (ADR-002 требование 2).
 * Используется API-процессом (create/CRUD, tenant-scoped методы) и worker-
 * процессом (findById — без tenant-фильтра, worker читает по sourceId из
 * outbox-события payload, не имеет tenant-сессии в том же смысле, что API).
 */
@Injectable()
export class DevelopmentRepository {
  constructor(
    @InjectModel(DevelopmentDocument.name) private readonly model: Model<DevelopmentDocument>,
  ) {}

  async create(
    params: {
      organizationId: Types.ObjectId;
      name: string;
      location: DevelopmentLocation;
      contact: DevelopmentContact;
      classType?: string;
      startDate?: Date;
      completionDate?: Date;
      description?: string;
    },
    session?: ClientSession,
  ): Promise<DevelopmentDocument> {
    const [doc] = await this.model.create([{ ...params, status: 'draft', version: 0 }], { session });
    return doc!;
  }

  /**
   * ADR-002 требование 1: organizationId — часть фильтра, не отдельная
   * post-fetch проверка — findById без tenant-фильтра возвращал бы любой
   * Development вне зависимости от организации вызывающего, что было бы
   * IDOR (тот же класс проблемы, что уже закрывался в media/organizations
   * модулях). NOT_FOUND единый для "не существует" и "чужая организация"
   * (error-catalog.md).
   */
  async findByIdForOrganization(
    id: Types.ObjectId,
    organizationId: Types.ObjectId,
  ): Promise<DevelopmentDocument | null> {
    return this.model.findOne({ _id: id, organizationId }).exec();
  }

  /**
   * Worker-side: без tenant-фильтра — worker обрабатывает outbox-события
   * как system actor (ADR-002), не как identity-сессия конкретной
   * организации; sourceId уже пришёл из доверенного internal-payload
   * (outbox-событие, публикуемое тем же кодовым артефактом), не от
   * недоверенного внешнего клиента — тот же принцип, что MediaVerified
   * payload в apps/worker/src/handlers/media-verified.handler.ts.
   */
  async findById(id: Types.ObjectId): Promise<DevelopmentDocument | null> {
    return this.model.findById(id).exec();
  }

  async listForOrganization(
    organizationId: Types.ObjectId,
    params: { cursor?: Types.ObjectId; limit: number },
  ): Promise<DevelopmentDocument[]> {
    const filter: Record<string, unknown> = { organizationId };
    if (params.cursor) {
      filter._id = { $gt: params.cursor };
    }
    return this.model.find(filter).sort({ _id: 1 }).limit(params.limit).exec();
  }

  /**
   * Optimistic concurrency (conventions.md разд.5): update условен на
   * ожидаемой version — при несовпадении modifiedCount:0, вызывающий код
   * трактует это как VERSION_CONFLICT (409), не как "запись не найдена".
   */
  async updateWithVersionCheck(
    id: Types.ObjectId,
    organizationId: Types.ObjectId,
    expectedVersion: number,
    changes: Partial<{
      name: string;
      location: DevelopmentLocation;
      contact: DevelopmentContact;
      classType: string;
      startDate: Date;
      completionDate: Date;
      description: string;
    }>,
    session?: ClientSession,
  ): Promise<{ modifiedCount: number }> {
    const result = await this.model
      .updateOne(
        { _id: id, organizationId, version: expectedVersion },
        { $set: changes, $inc: { version: 1 } },
        { session },
      )
      .exec();
    return { modifiedCount: result.modifiedCount };
  }

  async updateStatus(
    id: Types.ObjectId,
    organizationId: Types.ObjectId,
    status: 'draft' | 'active' | 'archived',
    session?: ClientSession,
  ): Promise<{ modifiedCount: number }> {
    const result = await this.model
      .updateOne({ _id: id, organizationId }, { $set: { status }, $inc: { version: 1 } }, { session })
      .exec();
    return { modifiedCount: result.modifiedCount };
  }
}
