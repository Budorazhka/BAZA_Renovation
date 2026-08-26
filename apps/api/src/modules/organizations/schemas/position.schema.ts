import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type FixedRole = 'owner' | 'director' | 'rop' | 'manager' | 'administrator' | 'marketer';
export type PositionStatus = 'vacant' | 'occupied' | 'closed';

/**
 * docs/architecture/domain-model.md Модуль 2 / mongodb-schema.md `positions`.
 * Шесть фиксированных ролей (ADR-003, ADR-008 Accepted в исходном журнале
 * решений master plan) — не расширяемый enum без нового решения владельца.
 * `marketer` добавлена 25.08.2026 [technical decision, не owner decision] —
 * существующий ERP-фронтенд (apps/erp-web/src/types/team.ts::TeamUserRole)
 * уже включает эту роль, permission-matrix.md разд.1.2 фиксирует минимальный
 * grant-набор для неё как first-pass предположение, требующее подтверждения.
 */
@Schema({ collection: 'positions', timestamps: { createdAt: 'createdAt', updatedAt: false } })
export class PositionDocument extends Document {
  declare _id: Types.ObjectId;

  // Без index:true здесь — компаунд-индексы ниже ({organizationId,status} и
  // {organizationId,fixedRole}) уже обслуживают запросы по одному organizationId
  // через MongoDB index prefix, отдельный одиночный индекс избыточен.
  @Prop({ required: true, type: Types.ObjectId, ref: 'OrganizationDocument' })
  organizationId!: Types.ObjectId;

  @Prop({ required: true, enum: ['owner', 'director', 'rop', 'manager', 'administrator', 'marketer'] })
  fixedRole!: FixedRole;

  @Prop({ type: Types.ObjectId, ref: 'PositionDocument' })
  parentPositionId?: Types.ObjectId;

  @Prop({ required: true, enum: ['vacant', 'occupied', 'closed'], default: 'vacant' })
  status!: PositionStatus;

  // accessProfile — permission grants, привязанные к позиции. Реализуется
  // через отдельную коллекцию permission_grants (Authorization module),
  // не embedded здесь — избегаем дублирования источника истины прав.

  @Prop()
  currentOccupantName?: string; // денормализовано для UI, ADR-003 consequences

  /**
   * teamApi.ts::uploadAvatar (ДОБАВЛЕНО, honest gap закрыт 26.08.2026) —
   * ссылка на MediaAssetDocument (@baza/media-storage), не сам URL: worker
   * генерирует публичные derivative-variants асинхронно после MediaVerified
   * (ADR-008), готового URL в момент upload ещё нет. TeamService резолвит
   * фактический URL на чтение через MediaAssetRepository.findById, не
   * денормализует его сюда — тот же принцип, что currentOccupantName НЕ
   * применяется здесь: URL меняется по мере генерации variants worker'ом,
   * денормализованная копия рассинхронизировалась бы. Переживает vacate
   * НАМЕРЕННО — avatar принадлежит Position (как currentOccupantName), не
   * конкретной Identity; следующий occupant увидит фото предыдущего до
   * явной замены, тот же принцип, что personalAccess/accessProfile
   * остаются на позиции при смене человека.
   */
  @Prop({ type: Types.ObjectId, ref: 'MediaAssetDocument' })
  avatarAssetId?: Types.ObjectId;

  declare createdAt: Date;
}

export const PositionSchema = SchemaFactory.createForClass(PositionDocument);
PositionSchema.index({ organizationId: 1, status: 1 });
PositionSchema.index({ organizationId: 1, fixedRole: 1 });
PositionSchema.index({ parentPositionId: 1 });
