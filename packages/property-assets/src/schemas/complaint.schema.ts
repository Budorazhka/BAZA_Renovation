import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { OwnerScopeSchema, type OwnerScope } from '@baza/tenant-scope';

export type ComplaintCategory = 'not_available' | 'wrong_info' | 'scam' | 'duplicate' | 'other';
export type ComplaintStatus = 'pending' | 'resolved_upheld' | 'resolved_dismissed';

/**
 * ADMIN-OPS-001 (master plan разд.6.3 "Dedupe & Moderation": "duplicate
 * candidates, overrides, complaints, automated rules" / "Считать жалобу
 * доказанным нарушением" — явный domain invariant: подача жалобы сама по
 * себе НЕ является нарушением, только ставит карточку в очередь на ручное
 * admin-решение, ADR-006-подобный принцип уже применённый DuplicateCandidate).
 *
 * `reporterName`/`reporterPhone`/`reporterEmail` все опциональны — жалобщик
 * может быть анонимным посетителем сайта (тот же принцип, что
 * RevealContactDto/CrmService.revealContact — гость без сессии).
 *
 * `respondentScope` (не голый `organizationId`) — physical asset может быть
 * опубликован ЛИБО организацией, ЛИБО marketplace-аккаунтом без ERP (owner/
 * realtor publishing wizard, `publisherScope` на PropertyAssetDocument/
 * ListingDocument) — тот же `OwnerScope`-union уже используется по всей
 * этой пачке схем, жёсткий `organizationId` не покрыл бы вторую ветку.
 *
 * `scopeCity` денормализован из `PropertyAsset.location.city` на момент
 * подачи — permission-matrix.md `complaint.resolve.city(X)` фильтрует
 * admin-очередь по этому полю напрямую, без join к property_assets на
 * каждый list-запрос.
 */
@Schema({ collection: 'complaints', timestamps: { createdAt: 'createdAt', updatedAt: false } })
export class ComplaintDocument extends Document {
  declare _id: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId })
  propertyAssetId!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId })
  listingId!: Types.ObjectId;

  @Prop({ type: OwnerScopeSchema, required: true })
  respondentScope!: OwnerScope;

  @Prop({ required: true })
  scopeCity!: string;

  @Prop({ required: true, enum: ['not_available', 'wrong_info', 'scam', 'duplicate', 'other'] })
  category!: ComplaintCategory;

  @Prop()
  details?: string;

  @Prop()
  reporterName?: string;

  @Prop()
  reporterPhone?: string;

  @Prop()
  reporterEmail?: string;

  @Prop({ required: true, enum: ['pending', 'resolved_upheld', 'resolved_dismissed'], default: 'pending' })
  status!: ComplaintStatus;

  @Prop()
  resolvedAt?: Date;

  @Prop({ type: Types.ObjectId })
  resolvedByAdminId?: Types.ObjectId;

  @Prop()
  resolutionReason?: string;

  declare createdAt: Date;
}

export const ComplaintSchema = SchemaFactory.createForClass(ComplaintDocument);

// Admin-очередь: pending-жалобы конкретного города, самые старые первыми
// (FIFO-по построению через _id как secondary sort).
ComplaintSchema.index({ status: 1, scopeCity: 1, _id: 1 });
ComplaintSchema.index({ listingId: 1, _id: -1 });
ComplaintSchema.index({ propertyAssetId: 1 }, { sparse: true });
