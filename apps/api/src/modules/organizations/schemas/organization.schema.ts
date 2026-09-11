import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type OrganizationType = 'agency' | 'developer' | 'independent_realtor';
export type OrganizationStatus = 'active' | 'frozen' | 'archived';

/**
 * docs/architecture/domain-model.md Модуль 2 / mongodb-schema.md `organizations`.
 * Не содержит organizationId сама (корень tenant-границы, ADR-002).
 */
@Schema({ collection: 'organizations', timestamps: { createdAt: 'createdAt', updatedAt: false } })
export class OrganizationDocument extends Document {
  declare _id: Types.ObjectId;

  @Prop({ required: true, enum: ['agency', 'developer', 'independent_realtor'] })
  type!: OrganizationType;

  @Prop({ required: true })
  name!: string;

  @Prop({ required: true, enum: ['active', 'frozen', 'archived'], default: 'active' })
  status!: OrganizationStatus;

  /**
   * `[organization-legacy-migration]`: id компании (застройщик/агентство) в
   * старой системе — ключ идемпотентности для будущего одноразового
   * скрипта переноса, тот же принцип, что lead.schema.ts::legacyId:
   * повторный прогон импорта обязан находить уже созданную Organization по
   * legacyId и обновлять её, а не заводить дубль. Опционально — только у
   * мигрированных организаций оно есть, обычная регистрация
   * (registerOrganizationOwner) его никогда не заполняет.
   *
   * Индекс — глобальный unique, НЕ составной с organizationId: Organization
   * сама является корнем tenant-границы (см. докстринг класса выше, ADR-002)
   * и не хранит собственный organizationId, поэтому scoping-ключ, которым
   * lead.schema.ts ограничивает уникальность внутри организации, здесь
   * просто отсутствует — уникальность legacyId имеет смысл только
   * глобально. `sparse:true` безопасен для одиночного поля индекса (не
   * составной ключ, ловушка из lead.schema.ts на compound-индексе здесь не
   * применима).
   */
  @Prop({ required: false })
  legacyId?: string;

  declare createdAt: Date;
}

export const OrganizationSchema = SchemaFactory.createForClass(OrganizationDocument);
OrganizationSchema.index({ type: 1, status: 1 });
OrganizationSchema.index({ legacyId: 1 }, { unique: true, sparse: true });
