import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { OrganizationDocument, type OrganizationType } from '../schemas/organization.schema';

/**
 * Единственная точка доступа к коллекции organizations (ADR-002 требование 2).
 */
@Injectable()
export class OrganizationRepository {
  constructor(
    @InjectModel(OrganizationDocument.name) private readonly model: Model<OrganizationDocument>,
  ) {}

  async create(
    params: { type: OrganizationType; name: string },
    session?: ClientSession,
  ): Promise<OrganizationDocument> {
    const [doc] = await this.model.create([{ type: params.type, name: params.name }], { session });
    return doc!;
  }

  async findById(id: Types.ObjectId): Promise<OrganizationDocument | null> {
    return this.model.findById(id).exec();
  }
}
