import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/**
 * pending_invite — ИСХОДНОЕ и ЕДИНСТВЕННОЕ временное состояние Identity,
 * созданной через assignOccupant-invite-flow ДО того, как приглашённый
 * поставил себе пароль (POST /invite/:token/activate). passwordHash
 * отсутствует в этом состоянии (ниже в схеме) — login() явно отклоняет
 * такую Identity (AUTH_INVALID_CREDENTIALS, не раскрывая, что аккаунт
 * "существует, но не активирован" — тот же non-disclosure принцип, что
 * везде в auth-модуле). activate() необратимо переводит в 'active'.
 */
export type IdentityStatus = 'active' | 'deactivated' | 'pending_invite';
export type TwoFactorMethod = 'none' | 'telegram_bot' | 'totp';

/**
 * docs/architecture/domain-model.md Модуль 1 / mongodb-schema.md `identities`.
 * Identity НЕ хранит текущую роль/организацию — только способ входа.
 */
@Schema({ collection: 'identities', timestamps: { createdAt: 'createdAt', updatedAt: false } })
export class IdentityDocument extends Document {
  declare _id: Types.ObjectId;

  @Prop({ required: true, unique: true })
  normalizedLogin!: string;

  /**
   * required:false (ИЗМЕНЕНО, invite-flow) — pending_invite Identity
   * создаётся assignOccupant-по-email БЕЗ пароля, приглашённый ставит его
   * сам через POST /invite/:token/activate. login() обязан проверять
   * наличие passwordHash явно (см. auth.service.ts) — argon2.verify(undefined,...)
   * не является безопасной заменой этой проверки.
   */
  @Prop({ select: false })
  passwordHash?: string;

  /**
   * `[identity-legacy-migration]`: bcrypt-хеш пароля, унаследованный из
   * старой системы (здесь — argon2, см. auth.service.ts::verifyCredentials).
   * Что там именно bcrypt — предположение, не проверенное на копии базы
   * (docs/operations/legacy-migration.md). Отдельное поле, НЕ переиспользует
   * `passwordHash` — формат хеша (bcrypt vs argon2) должен быть однозначен
   * по имени поля, а не определяться эвристикой над содержимым строки.
   * `select:false` по тому же принципу, что `passwordHash` выше — не
   * должен утекать в обычные find/toJSON.
   *
   * Существует только в переходном окне после одноразового импорта
   * мигрированной Identity и ДО первого успешного логина владельца этим
   * старым паролем: verifyCredentials переносит его в `passwordHash`
   * (argon2) при первой успешной bcrypt-проверке и удаляет это поле —
   * fallback-путь срабатывает не больше одного раза на Identity, дальше
   * она полностью на argon2, как и любая обычная Identity.
   */
  @Prop({ select: false })
  legacyPasswordHash?: string;

  @Prop({ required: true, enum: ['active', 'deactivated', 'pending_invite'], default: 'active' })
  status!: IdentityStatus;

  @Prop({ required: true, enum: ['none', 'telegram_bot', 'totp'], default: 'none' })
  twoFactorMethod!: TwoFactorMethod;

  @Prop()
  deactivatedAt?: Date;

  /**
   * `[identity-legacy-migration]`: id учётной записи в старой системе —
   * ключ идемпотентности для будущего одноразового скрипта переноса.
   * Старая система хранила ДВЕ разных коллекции пользователей (platform +
   * CRM), которые здесь сливаются в одну Identity — при повторном прогоне
   * импорта скрипт обязан находить уже созданную Identity по legacyId и
   * обновлять её, а не заводить дубль (тот же принцип, что
   * lead.schema.ts::legacyId). Опционально — только у мигрированных
   * Identity оно есть, обычная регистрация (registerIdentity/
   * findOrCreatePendingIdentity) его никогда не заполняет.
   *
   * Индекс — глобальный unique (не составной, `sparse:true` безопасен):
   * Identity, в отличие от Lead, не имеет organizationId (не tenant-scoped
   * сущность, см. докстринг класса выше) — глобальная уникальность login'а
   * здесь и так норма (см. normalizedLogin). `sparse` для одиночного поля
   * не подвержен ловушке составного индекса из lead.schema.ts (там
   * `sparse` ломался из-за ВТОРОГО поля индекса, всегда присутствующего) —
   * здесь поле в индексе одно, `sparse` просто пропускает документы без
   * legacyId.
   */
  @Prop({ required: false })
  legacyId?: string;

  declare createdAt: Date;
}

export const IdentitySchema = SchemaFactory.createForClass(IdentityDocument);
IdentitySchema.index({ legacyId: 1 }, { unique: true, sparse: true });
