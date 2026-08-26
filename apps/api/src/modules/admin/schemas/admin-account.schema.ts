import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AdminAccountStatus = 'active' | 'deactivated';

/**
 * docs/architecture/adr/009-admin-permission-scopes.md /
 * docs/architecture/mongodb-schema.md `admin_accounts`. Только super_admin
 * создаёт AdminAccount и назначает grants (ADR-009 owner decision #133) —
 * `isSuperAdmin` — свойство САМОГО аккаунта, не PermissionGrant: если бы
 * super_admin-статус выражался через грант, обычный grant-management право
 * могло бы теоретически его выдать, что прямо противоречит structural
 * self-escalation prevention (ADR-009 Security impact).
 *
 * Organizations никогда не получают Admin-доступ (ADR-009) — identityId
 * здесь принципиально НЕ связан с PositionAssignment (ADR-003), это разные,
 * не пересекающиеся authorization-контуры, даже если технически один и тот
 * же человек имеет и то, и другое.
 */
@Schema({ collection: 'admin_accounts', timestamps: { createdAt: 'createdAt', updatedAt: false } })
export class AdminAccountDocument extends Document {
  declare _id: Types.ObjectId;

  @Prop({ required: true, unique: true, type: Types.ObjectId })
  identityId!: Types.ObjectId;

  @Prop({ required: true, enum: ['active', 'deactivated'], default: 'active' })
  status!: AdminAccountStatus;

  @Prop({ required: true, default: false })
  isSuperAdmin!: boolean;

  declare createdAt: Date;
}

export const AdminAccountSchema = SchemaFactory.createForClass(AdminAccountDocument);
