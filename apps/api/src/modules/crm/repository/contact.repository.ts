import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { ContactDocument, ContactRole } from '../schemas/contact.schema';

/**
 * Единственная точка доступа к коллекции contacts (ADR-002 требование 2).
 */
@Injectable()
export class ContactRepository {
  constructor(@InjectModel(ContactDocument.name) private readonly model: Model<ContactDocument>) {}

  /**
   * domain-model.md Module 7 invariant: tenant-local dedupe по phone —
   * только внутри организации, cross-tenant существование не раскрывается.
   */
  async findByPhone(organizationId: Types.ObjectId, phone: string): Promise<ContactDocument | null> {
    return this.model.findOne({ organizationId, phone }).exec();
  }

  async create(
    params: { organizationId: Types.ObjectId; name: string; phone: string; email?: string; roles: ContactRole[] },
    session?: ClientSession,
  ): Promise<ContactDocument> {
    const [doc] = await this.model.create([params], { session });
    return doc!;
  }

  async findByIdForOrganization(
    id: Types.ObjectId,
    organizationId: Types.ObjectId,
  ): Promise<ContactDocument | null> {
    return this.model.findOne({ _id: id, organizationId }).exec();
  }

  /**
   * CRM list read-model: contacts всегда выбираются вместе с тем же
   * organizationId, даже когда id уже пришли из tenant-scoped leads. Это
   * не избыточная проверка: не даёт превратить ошибочную ссылку contactId
   * в утечку контакта другой организации.
   */
  async findByIdsForOrganization(
    organizationId: Types.ObjectId,
    ids: Types.ObjectId[],
  ): Promise<ContactDocument[]> {
    if (ids.length === 0) return [];
    return this.model.find({ _id: { $in: ids }, organizationId }).exec();
  }
}
