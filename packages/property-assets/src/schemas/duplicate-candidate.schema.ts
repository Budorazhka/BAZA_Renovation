import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type DuplicateCandidateStatus = 'detected' | 'confirmed_duplicate' | 'override_not_duplicate';

/**
 * DEDUPE-001 (domain-model.md Модуль 6, owner decision xlsx #58/#70):
 * "Физический объект вторички имеет одного владельца/представителя.
 * Несколько объявлений об одном объекте считаются кандидатами в дубли."
 * Не organization-scoped — дубли обнаруживаются МЕЖДУ разными
 * PropertyAsset, потенциально принадлежащими разным организациям/
 * marketplace-аккаунтам (тот же физический объект мог быть заведён
 * дважды разными риэлторами) — в отличие от CRM Contact/Lead dedupe
 * (tenant-local, master plan явно требует "Дубль лида ищется только
 * внутри одной организации"). Здесь наоборот: если бы dedupe был
 * tenant-scoped, он бы физически не мог найти дубль, заведённый другой
 * организацией — а именно это и есть основной сценарий, который нужно
 * ловить.
 */
@Schema({ collection: 'duplicate_candidates', timestamps: { createdAt: 'detectedAt', updatedAt: false } })
export class DuplicateCandidateDocument extends Document {
  declare _id: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId })
  propertyAssetIdA!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId })
  propertyAssetIdB!: Types.ObjectId;

  @Prop({
    type: {
      phoneMatch: { type: Boolean, required: true },
      addressMatch: { type: Boolean, required: true },
      roomsAreaFloorMatch: { type: Boolean, required: true },
    },
    required: true,
  })
  signals!: {
    phoneMatch: boolean;
    addressMatch: boolean;
    roomsAreaFloorMatch: boolean;
  };

  @Prop({ required: true, enum: ['detected', 'confirmed_duplicate', 'override_not_duplicate'], default: 'detected' })
  status!: DuplicateCandidateStatus;

  @Prop()
  overrideReason?: string;

  @Prop({ type: Types.ObjectId })
  overrideByIdentityId?: Types.ObjectId;

  @Prop()
  overrideAt?: Date;

  /**
   * Admin-confirm (DEDUPE-001 admin review queue) — тот же уровень
   * audit-контекста на самом документе, что override* поля выше, не
   * только в отдельной audit_events записи: reason/actor/timestamp
   * читаемы прямо на кандидате без join к audit log для отображения в
   * admin-очереди.
   */
  @Prop()
  confirmReason?: string;

  @Prop({ type: Types.ObjectId })
  confirmByAdminAccountId?: Types.ObjectId;

  @Prop()
  confirmedAt?: Date;

  declare detectedAt: Date;
}

export const DuplicateCandidateSchema = SchemaFactory.createForClass(DuplicateCandidateDocument);

// mongodb-schema.md: "{propertyAssetIdA:1, propertyAssetIdB:1} unique compound
// (не дублировать пару)" — repository-уровень ВСЕГДА нормализует пару так,
// что propertyAssetIdA < propertyAssetIdB (лексикографически по hex-строке
// ObjectId), иначе один и тот же физический дубль (A,B) и (B,A) считался бы
// РАЗНЫМИ парами этим индексом — unique constraint не поймал бы повторное
// обнаружение той же пары в другом порядке.
DuplicateCandidateSchema.index({ propertyAssetIdA: 1, propertyAssetIdB: 1 }, { unique: true });
// admin-очередь: detected/override_not_duplicate требуют ручной проверки
// (mongodb-schema.md разд. duplicate_candidates).
DuplicateCandidateSchema.index({ status: 1 });
// resolveActiveConflicts: "есть ли confirmed_duplicate/detected пара,
// включающая этот propertyAssetId" — обслуживает поиск по любой стороне
// пары без full collection scan.
DuplicateCandidateSchema.index({ propertyAssetIdA: 1, status: 1 });
DuplicateCandidateSchema.index({ propertyAssetIdB: 1, status: 1 });
