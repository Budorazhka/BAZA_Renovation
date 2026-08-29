import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { PermissionGrantDocument, type PermissionSubjectType } from '../schemas/permission-grant.schema';

/**
 * Единственная точка доступа к коллекции permission_grants (ADR-002 требование 2).
 */
@Injectable()
export class PermissionGrantRepository {
  constructor(
    @InjectModel(PermissionGrantDocument.name) private readonly model: Model<PermissionGrantDocument>,
  ) {}

  /**
   * revokedAt:{$exists:false} — отозванный grant (revoke, append-only)
   * немедленно перестаёт учитываться в evaluate()/resolveListScope()/
   * listGrantsForSubject(), не только в новом коде: это единственное место
   * чтения grants для subject, поэтому фильтр здесь автоматически покрывает
   * GET /admin/me на следующий же запрос без отдельного кэша для инвалидации.
   */
  async findForSubject(
    subjectType: PermissionSubjectType,
    subjectId: Types.ObjectId,
  ): Promise<PermissionGrantDocument[]> {
    return this.model.find({ subjectType, subjectId, revokedAt: { $exists: false } }).exec();
  }

  async findById(id: Types.ObjectId): Promise<PermissionGrantDocument | null> {
    return this.model.findOne({ _id: id }).exec();
  }

  /**
   * GET /admin/accounts/:id/grants: список включает уже отозванные grants
   * (не фильтрует revokedAt) — экран "Права доступа" должен честно
   * показывать историю, не только текущее активное подмножество, иначе
   * super_admin не отличит "grant никогда не выдавался" от "был выдан и
   * отозван". findForSubject выше (авторизационный путь) — единственное
   * место, где фильтр revokedAt обязателен.
   */
  async findAllForSubject(
    subjectType: PermissionSubjectType,
    subjectId: Types.ObjectId,
  ): Promise<PermissionGrantDocument[]> {
    return this.model.find({ subjectType, subjectId }).sort({ createdAt: 1 }).exec();
  }

  /**
   * CAS/optimistic concurrency: filter включает и _id, и revokedAt:
   * {$exists:false}, и version:expectedVersion — modifiedCount:0 означает
   * либо "grant уже отозван кем-то другим между чтением списка и этим
   * вызовом" (race), либо "expectedVersion устарел", либо "grant не
   * существует" — вызывающий код (PolicyEvaluatorService.revokeGrant)
   * различает эти случаи отдельным findById после неудачи, не здесь.
   */
  async revoke(
    id: Types.ObjectId,
    expectedVersion: number,
    params: { revokedBy: Types.ObjectId; reason: string },
    session?: ClientSession,
  ): Promise<{ modifiedCount: number }> {
    const result = await this.model
      .updateOne(
        { _id: id, revokedAt: { $exists: false }, version: expectedVersion },
        { $set: { revokedAt: new Date(), revokedBy: params.revokedBy, revokeReason: params.reason } },
        { session },
      )
      .exec();
    return { modifiedCount: result.modifiedCount };
  }

  async create(params: {
    subjectType: PermissionSubjectType;
    subjectId: Types.ObjectId;
    resource: string;
    action: string;
    scope: string;
    scopeValue?: string;
  }): Promise<PermissionGrantDocument> {
    return this.model.create(params);
  }

  /**
   * grantDefaultRolePermissions (organizations.service.ts) — стартовый
   * набор grants для роли (до 21 записи для owner) одним insertMany вместо
   * N последовательных create() (second-opinion ревью: N round-trips на
   * каждое создание Position — не хайп-путь, но легко устранимая
   * неэффективность).
   */
  async createMany(
    items: Array<{
      subjectType: PermissionSubjectType;
      subjectId: Types.ObjectId;
      resource: string;
      action: string;
      scope: string;
      scopeValue?: string;
    }>,
  ): Promise<void> {
    if (items.length === 0) {
      return;
    }
    await this.model.insertMany(items);
  }
}
