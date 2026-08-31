import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PermissionSubjectType = 'position' | 'admin_account';
export type PermissionScope =
  | 'own'
  | 'position'
  | 'team'
  | 'organization'
  | 'project'
  | 'city'
  | 'global'
  | 'assigned'
  | 'domain';

/**
 * docs/architecture/domain-model.md Модуль 3 / docs/security/permission-matrix.md.
 * Единая структура для ERP-organization grants (subjectType: 'position') и
 * Admin grants (subjectType: 'admin_account') — ADR-009.
 */
@Schema({ collection: 'permission_grants', timestamps: { createdAt: 'createdAt', updatedAt: false } })
export class PermissionGrantDocument extends Document {
  declare _id: Types.ObjectId;

  @Prop({ required: true, enum: ['position', 'admin_account'] })
  subjectType!: PermissionSubjectType;

  @Prop({ required: true, type: Types.ObjectId })
  subjectId!: Types.ObjectId;

  @Prop({ required: true })
  resource!: string;

  @Prop({ required: true })
  action!: string;

  @Prop({
    required: true,
    enum: ['own', 'position', 'team', 'organization', 'project', 'city', 'global', 'assigned', 'domain'],
  })
  scope!: PermissionScope;

  @Prop()
  scopeValue?: string;

  /**
   * Revoke — append-only (ADR-006/master plan разд.6.3 audit-принцип):
   * grant никогда не удаляется физически, только помечается revokedAt/
   * revokedBy/revokeReason. findForSubject (repository) фильтрует
   * revokedAt:{$exists:false} по умолчанию — отозванный grant немедленно
   * перестаёт учитываться в evaluate()/resolveListScope(), но запись
   * остаётся в коллекции для истории (audit_events дублирует факт revoke
   * отдельной записью, но сам документ гранта — источник истины "что именно
   * было отозвано и когда", не только audit-лог).
   */
  @Prop()
  revokedAt?: Date;

  @Prop({ type: Types.ObjectId })
  revokedBy?: Types.ObjectId;

  @Prop()
  revokeReason?: string;

  /**
   * Optimistic concurrency (CAS) для revoke: клиент передаёт version,
   * прочитанную вместе со списком grants (GET /admin/accounts/:id/grants) —
   * revoke сравнивает его с текущим значением в фильтре updateOne, не
   * читает-потом-пишет отдельными шагами. Начинается с 1 при создании,
   * не инкрементируется больше нигде (revoke — единственная мутация
   * существующего гранта), поэтому конфликт означает ровно "кто-то другой
   * уже отозвал этот же grant между вашим чтением списка и этим вызовом".
   */
  @Prop({ required: true, default: 1 })
  version!: number;

  declare createdAt: Date;
}

export const PermissionGrantSchema = SchemaFactory.createForClass(PermissionGrantDocument);

// mongodb-schema.md: {subjectType, subjectId} — основной authorization-запрос
// на каждый API-вызов ("все права этого subject").
PermissionGrantSchema.index({ subjectType: 1, subjectId: 1 });
