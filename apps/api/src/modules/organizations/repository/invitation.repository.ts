import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { InvitationDocument } from '../schemas/invitation.schema';

/**
 * Единственная точка доступа к коллекции invitations (ADR-002 требование 2).
 */
@Injectable()
export class InvitationRepository {
  constructor(@InjectModel(InvitationDocument.name) private readonly model: Model<InvitationDocument>) {}

  async create(
    params: {
      organizationId: Types.ObjectId;
      positionId: Types.ObjectId;
      identityId: Types.ObjectId;
      tokenHash: string;
      email: string;
      expiresAt: Date;
    },
    session?: ClientSession,
  ): Promise<InvitationDocument> {
    const [doc] = await this.model.create([params], { session });
    return doc!;
  }

  /**
   * tokenHash имеет select:false — activate-flow единственный легитимный
   * потребитель (тот же принцип, что passwordHash на IdentityDocument),
   * запрашивает явно.
   */
  async findByTokenHash(tokenHash: string): Promise<InvitationDocument | null> {
    return this.model.findOne({ tokenHash }).select('+tokenHash').exec();
  }

  /**
   * activate() — условие status:'pending' в фильтре enforced на уровне
   * запроса (тот же паттерн, что markClosed/updateStatus везде в кодовой
   * базе): modifiedCount:0 различает "уже активировано"/"истекло" от
   * "не найдено" через отдельный lookup вызывающим кодом.
   */
  async markActivated(id: Types.ObjectId, session?: ClientSession): Promise<{ modifiedCount: number }> {
    const result = await this.model
      .updateOne({ _id: id, status: 'pending' }, { $set: { status: 'activated' } }, { session })
      .exec();
    return { modifiedCount: result.modifiedCount };
  }
}
