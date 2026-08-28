import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { ProductAccessDocument, type ProductAccessProduct } from '../schemas/product-access.schema';

/**
 * Единственная точка доступа к коллекции product_accesses (ADR-002
 * требование 2).
 */
@Injectable()
export class ProductAccessRepository {
  constructor(
    @InjectModel(ProductAccessDocument.name) private readonly model: Model<ProductAccessDocument>,
  ) {}

  /**
   * ADR-004 login-flow: "есть ли у X активный доступ к ERP/Admin" —
   * revokedAt отсутствует означает грант всё ещё активен.
   */
  async hasActiveAccess(
    identityId: Types.ObjectId,
    product: ProductAccessProduct,
    session?: ClientSession,
  ): Promise<boolean> {
    const existing = await this.model
      .findOne({ identityId, product, revokedAt: { $exists: false } })
      .select('_id')
      .session(session ?? null)
      .exec();
    return existing !== null;
  }

  /**
   * Идемпотентно относительно повторного assignOccupant той же identity
   * (например, повторное назначение после vacate/re-hire) — не создаёт
   * дубликат активного гранта, если уже есть незакрытый.
   */
  async grantIfNotActive(
    identityId: Types.ObjectId,
    product: ProductAccessProduct,
    session?: ClientSession,
  ): Promise<void> {
    const alreadyActive = await this.hasActiveAccess(identityId, product, session);
    if (alreadyActive) return;
    await this.model.create([{ identityId, product, grantedAt: new Date() }], { session });
  }

  async revokeAllForIdentity(identityId: Types.ObjectId, product: ProductAccessProduct): Promise<void> {
    await this.model
      .updateMany({ identityId, product, revokedAt: { $exists: false } }, { $set: { revokedAt: new Date() } })
      .exec();
  }
}
