import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { OwnerScope, OwnerScopeSchema } from '@baza/tenant-scope';

/**
 * Объявлен ЗДЕСЬ (не импортирован из media-storage.service.ts, хотя
 * концептуально это тот же тип) намеренно: NestJS Mongoose decorator
 * metadata reflection не может разрешить форму union-типа, пришедшего
 * ИЗВНЕ модуля, где он используется в @Prop() — падает рантайм-ошибкой
 * "Cannot determine a type for... union/intersection/ambiguous type was
 * used" при реальной загрузке схемы (НЕ ловится typecheck — обнаружено
 * только при первом реальном инстанцировании класса через
 * SchemaFactory.createForClass в тесте, который импортирует весь пакет
 * целиком, не только тип). Для ЛОКАЛЬНО объявленных union-типов (как
 * MediaAssetStatus ниже) тот же паттерн работает — источник разницы,
 * видимо, в NestJS CLI Mongoose-плагине, который читает форму типа
 * непосредственно из AST текущего файла для локальных типов, но не может
 * этого для импортированных. media-storage.service.ts импортирует
 * MediaBucket ОТСЮДА, не наоборот.
 */
export type MediaBucket = 'private' | 'public';

export type MediaAssetStatus = 'pending' | 'verified' | 'rejected';
export type MediaVariantType = 'thumbnail' | 'card' | 'detail';

export interface MediaVariant {
  type: MediaVariantType;
  assetPath: string;
  exifStripped: true;
}

const MediaVariantSchemaDefinition = {
  type: { type: String, enum: ['thumbnail', 'card', 'detail'], required: true },
  assetPath: { type: String, required: true },
  exifStripped: { type: Boolean, required: true },
};

/**
 * docs/architecture/domain-model.md Модуль 6 / mongodb-schema.md `media_assets`
 * (ADR-008). originalPath — приватный bucket, EXIF сохранён только там.
 * variants — публичные derivative-файлы, worker гарантирует exifStripped:true
 * на каждом (не опционально — ADR-008 EXIF-strip обязателен на MVP).
 *
 * Живёт в @baza/media-storage (не в apps/api) — и API-процесс (upload-intent/
 * confirm), и worker-процесс (чтение оригинала + запись derivative-вариантов
 * через appendVariant) обращаются к одной коллекции.
 */
@Schema({ collection: 'media_assets', timestamps: { createdAt: 'createdAt', updatedAt: false } })
export class MediaAssetDocument extends Document {
  declare _id: Types.ObjectId;

  @Prop({ type: OwnerScopeSchema, required: true })
  ownerScope!: OwnerScope;

  @Prop({ required: true, enum: ['pending', 'verified', 'rejected'], default: 'pending' })
  status!: MediaAssetStatus;

  /**
   * Заявленный клиентом MIME при upload-intent — ТОЛЬКО для генерации
   * presigned URL с корректным Content-Type заголовком, никогда не
   * источник истины для проверки безопасности (ADR-008: magic-byte
   * проверка на confirm обязательна, расширение/Content-Type подделываются).
   */
  @Prop({ required: true })
  declaredMimeType!: string;

  /**
   * Реальный MIME по magic bytes — заполняется на confirm-шаге worker'ом/
   * verify-сервисом, отсутствует, пока status === 'pending'.
   */
  @Prop()
  verifiedMimeType?: string;

  @Prop()
  checksum?: string;

  @Prop({ required: true })
  sizeBytes!: number;

  @Prop({ required: true, enum: ['private', 'public'] })
  bucket!: MediaBucket;

  /**
   * Storage key оригинала в приватном bucket — присваивается на upload-intent
   * (детерминированный путь `{assetId}/original.{ext}`), файл по нему
   * появляется только после того, как клиент реально загрузит его по
   * presigned URL (upload-intent создаёт запись раньше, чем файл существует).
   */
  @Prop({ required: true })
  originalPath!: string;

  @Prop({ type: [MediaVariantSchemaDefinition], default: [] })
  variants!: MediaVariant[];

  @Prop({ required: true })
  purpose!: string;

  @Prop()
  rejectionReason?: string;

  /**
   * Orphaned pending media cleanup (media-cleanup.job.ts) claim-marker —
   * НЕ новое значение в MediaAssetStatus enum (это добавило бы 4-е
   * состояние, которое пришлось бы учитывать во ВСЕХ местах, читающих
   * status как 'pending'|'verified'|'rejected' — MediaService, TeamService,
   * property-assets read models и т.д., см. их докстринги). Отдельное поле
   * держит cleanup-claim независимым от бизнес-статуса: claim и unclaim не
   * меняют status вообще, asset остаётся 'pending' с точки зрения любого
   * другого кода, кроме самой cleanup-job. Timestamp (не boolean) — чтобы
   * повторный запуск мог отличить "claimed недавно, ещё in-flight" от
   * "claimed предыдущим прогоном, который упал между claim и storage-delete"
   * и безопасно повторить попытку для второго случая (см. job докстринг).
   */
  @Prop()
  orphanCleanupClaimedAt?: Date;

  declare createdAt: Date;
}

export const MediaAssetSchema = SchemaFactory.createForClass(MediaAssetDocument);

MediaAssetSchema.index({ 'ownerScope.organizationId': 1 }, { sparse: true });
MediaAssetSchema.index({ 'ownerScope.identityId': 1 }, { sparse: true });
MediaAssetSchema.index({ status: 1 });
MediaAssetSchema.index({ checksum: 1 });
