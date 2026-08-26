import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/**
 * team-users HR-профильные поля (26.08.2026, honest gap закрыт) —
 * `[technical decision]`, НЕ owner decision: ERP-фронтенд
 * (apps/erp-web/src/types/team.ts::TeamUser) ожидает широкий набор полей
 * (phone/telegram/birthDate/skills/vk/instagram/website/aboutMe/
 * aboutCompany/department/city/hireDate), которых нет ни в одном ADR/
 * domain-model.md — ни на Identity (только normalizedLogin/status), ни на
 * Position (fixedRole/parentPositionId/status/currentOccupantName/
 * avatarAssetId). Отдельная коллекция (не embedded в Position) — тот же
 * принцип, что avatarAssetId на самой Position: этот блок принадлежит
 * ПОЗИЦИИ (переживает vacate, как currentOccupantName/avatarAssetId), не
 * человеку — следующий occupant увидит профиль предыдущего до явного
 * update, тот же принцип, что accessProfile/personalAccess остаются на
 * позиции при смене занимающего. 1:1 с Position через positionId (unique) —
 * отдельная коллекция, не embedded document на PositionDocument, чтобы не
 * раздувать основную схему полями, не участвующими ни в одном domain-
 * инварианте/индексе Position.
 */
@Schema({ collection: 'position_profiles', timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } })
export class PositionProfileDocument extends Document {
  declare _id: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'PositionDocument', unique: true })
  positionId!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'OrganizationDocument' })
  organizationId!: Types.ObjectId;

  @Prop()
  phone?: string;

  @Prop()
  hireDate?: string;

  @Prop()
  birthDate?: string;

  @Prop()
  department?: string;

  @Prop()
  city?: string;

  @Prop()
  telegram?: string;

  @Prop()
  aboutMe?: string;

  @Prop()
  aboutCompany?: string;

  @Prop({ type: [String], default: [] })
  skills!: string[];

  @Prop()
  whatsapp?: string;

  @Prop()
  vk?: string;

  @Prop()
  instagram?: string;

  @Prop()
  website?: string;

  declare createdAt: Date;
  declare updatedAt: Date;
}

export const PositionProfileSchema = SchemaFactory.createForClass(PositionProfileDocument);
PositionProfileSchema.index({ organizationId: 1 });
