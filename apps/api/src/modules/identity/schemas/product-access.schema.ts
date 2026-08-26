import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ProductAccessProduct = 'erp' | 'admin';

/**
 * ADR-004: "Наличие marketplace-аккаунта (Identity, способного логиниться
 * на marketplace) не означает автоматический ERP-доступ — ERP-доступ
 * выдаётся отдельно, через PositionAssignment... или явный grant для Admin".
 * marketplace НЕ входит в ProductAccessProduct — любая активная Identity
 * может логиниться на marketplace без отдельного гранта (это базовый
 * аккаунт), только erp/admin требуют явного разрешения.
 *
 * mongodb-schema.md `product_accesses`. `revokedAt` — не удаление записи
 * (append-only история "когда/кому выдавался и отзывался доступ"), тот же
 * принцип, что `PositionAssignment.endedAt`.
 */
@Schema({ collection: 'product_accesses', timestamps: false })
export class ProductAccessDocument extends Document {
  declare _id: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId })
  identityId!: Types.ObjectId;

  @Prop({ required: true, enum: ['erp', 'admin'] })
  product!: ProductAccessProduct;

  @Prop({ required: true, default: () => new Date() })
  grantedAt!: Date;

  @Prop()
  revokedAt?: Date;
}

export const ProductAccessSchema = SchemaFactory.createForClass(ProductAccessDocument);

// mongodb-schema.md: обслуживает "есть ли у X доступ к ERP/Admin".
ProductAccessSchema.index({ identityId: 1, product: 1 });
