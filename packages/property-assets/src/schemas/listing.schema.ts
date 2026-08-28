import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { OwnerScopeSchema, type OwnerScope } from '@baza/tenant-scope';
import type { Currency } from '@baza/contracts';

export type ListingDealType = 'sale' | 'rent_long' | 'rent_short';
export type ListingStatus = 'draft' | 'active' | 'expired' | 'archived';

const MoneyAmountSchema = new MongooseSchema(
  {
    amountMinorUnits: { type: Number, required: true, min: 0 },
    currency: { type: String, enum: ['USD', 'GEL', 'RUB'], required: true },
  },
  { _id: false },
);

@Schema({ collection: 'listings', timestamps: { createdAt: 'createdAt', updatedAt: false } })
export class ListingDocument extends Document {
  declare _id: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId })
  propertyAssetId!: Types.ObjectId;

  @Prop({ type: OwnerScopeSchema, required: true })
  publisherScope!: OwnerScope;

  @Prop({ required: true, enum: ['sale', 'rent_long', 'rent_short'] })
  dealType!: ListingDealType;

  @Prop({ type: MoneyAmountSchema, required: true })
  price!: { amountMinorUnits: number; currency: Currency };

  @Prop({ required: true, enum: ['draft', 'active', 'expired', 'archived'], default: 'draft' })
  status!: ListingStatus;

  @Prop({ required: true, default: 0 })
  version!: number;

  @Prop()
  lastConfirmedAt?: Date;

  declare createdAt: Date;
}

export const ListingSchema = SchemaFactory.createForClass(ListingDocument);
ListingSchema.index({ 'publisherScope.organizationId': 1 }, { sparse: true });
// Owner/realtor marketplace publishing wizard: обслуживает
// findByIdForIdentity/listForAssetIdentity — та же sparse-стратегия, что
// organizationId-индекс выше.
ListingSchema.index({ 'publisherScope.identityId': 1 }, { sparse: true });
ListingSchema.index(
  { propertyAssetId: 1, dealType: 1 },
  { unique: true, partialFilterExpression: { status: 'active' } },
);
ListingSchema.index({ 'publisherScope.organizationId': 1, propertyAssetId: 1, status: 1 });
