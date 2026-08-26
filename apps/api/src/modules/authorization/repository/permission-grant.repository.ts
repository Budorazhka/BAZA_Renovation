import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PermissionGrantDocument, type PermissionSubjectType } from '../schemas/permission-grant.schema';

/**
 * Единственная точка доступа к коллекции permission_grants (ADR-002 требование 2).
 */
@Injectable()
export class PermissionGrantRepository {
  constructor(
    @InjectModel(PermissionGrantDocument.name) private readonly model: Model<PermissionGrantDocument>,
  ) {}

  async findForSubject(
    subjectType: PermissionSubjectType,
    subjectId: Types.ObjectId,
  ): Promise<PermissionGrantDocument[]> {
    return this.model.find({ subjectType, subjectId }).exec();
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
