import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/**
 * docs/architecture/domain-model.md Модуль 2 / mongodb-schema.md `position_assignments`.
 * ADR-003: partial unique indexes enforced-инвариант IAM-002/IAM-003 —
 * не более одного активного assignment на identity и на position одновременно.
 */
@Schema({ collection: 'position_assignments', timestamps: { createdAt: false, updatedAt: false } })
export class PositionAssignmentDocument extends Document {
  declare _id: Types.ObjectId;

  // Индекс на identityId задаётся ниже явным SchemaFactory.index() как
  // partial unique (ADR-003) — не дублируем через index:true в декораторе,
  // иначе получаем два разных индекса на одном поле (Mongoose warning).
  @Prop({ required: true, type: Types.ObjectId, ref: 'IdentityDocument' })
  identityId!: Types.ObjectId;

  // Аналогично identityId — partial unique index ниже.
  @Prop({ required: true, type: Types.ObjectId, ref: 'PositionDocument' })
  positionId!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'OrganizationDocument', index: true })
  organizationId!: Types.ObjectId;

  @Prop({ required: true, default: () => new Date() })
  startedAt!: Date;

  @Prop()
  endedAt?: Date;

  @Prop()
  handoverNote?: string;
}

export const PositionAssignmentSchema = SchemaFactory.createForClass(PositionAssignmentDocument);

// ADR-003 enforced-инвариант: partial unique index — MongoDB считает документы
// уникальными по identityId только среди тех, где endedAt отсутствует (null).
// Попытка создать второй активный assignment для того же identityId
// завершится ошибкой уникальности на уровне БД, не только application-логики.
PositionAssignmentSchema.index(
  { identityId: 1 },
  { unique: true, partialFilterExpression: { endedAt: { $exists: false } } },
);
PositionAssignmentSchema.index(
  { positionId: 1 },
  { unique: true, partialFilterExpression: { endedAt: { $exists: false } } },
);
PositionAssignmentSchema.index({ organizationId: 1, endedAt: 1 });
