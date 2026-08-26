import { Injectable, Logger } from '@nestjs/common';
import type { OutboxEventDocument } from '@baza/domain-events';
import {
  MediaAssetRepository,
  MediaStorageService,
  type MediaBucket,
  type MediaVariantType,
} from '@baza/media-storage';
import type { EventHandler } from '../outbox/event-handler';
import { ImageVariantService } from './image-variant.service';

const ALL_VARIANT_TYPES: readonly MediaVariantType[] = ['thumbnail', 'card', 'detail'];

/**
 * MediaVerified payload — точная структура, публикуемая
 * apps/api/src/modules/media/media.service.ts::confirmUpload.
 */
interface MediaVerifiedPayload {
  bucket: MediaBucket;
  originalPath: string;
  mimeType: string;
  purpose: string;
}

const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

/**
 * ADR-008: worker строит публичные derivative-варианты (thumbnail/card/
 * detail) и удаляет EXIF из них после MediaVerified. Не все verified-asset'ы
 * — изображения (application/pdf для agency_document тоже проходит через
 * тот же confirm-flow) — для не-image MIME derivative-generation просто не
 * применима, это НЕ ошибка обработки, событие подтверждается как обычно.
 */
@Injectable()
export class MediaVerifiedHandler implements EventHandler {
  private readonly logger = new Logger(MediaVerifiedHandler.name);

  constructor(
    private readonly mediaAssetRepository: MediaAssetRepository,
    private readonly storage: MediaStorageService,
    private readonly imageVariantService: ImageVariantService,
  ) {}

  async handle(event: OutboxEventDocument): Promise<void> {
    // event.payload типизирован как Record<string, unknown> на уровне
    // OutboxEventDocument (payload — произвольный JSON для ЛЮБОГО eventType,
    // не только MediaVerified) — приведение к конкретной форме без runtime-
    // валидации безопасно здесь, потому что payload полностью контролируется
    // тем же кодовым артефактом (media.service.ts::confirmUpload публикует
    // ровно эту структуру, ADR-001 "один кодовый артефакт, два процесса"),
    // не внешним/недоверенным источником.
    const payload = event.payload as unknown as MediaVerifiedPayload;

    if (!IMAGE_MIME_TYPES.has(payload.mimeType)) {
      this.logger.log(
        `MediaVerified для media_asset ${event.aggregateId.toString()}: MIME ${payload.mimeType} ` +
          `не является изображением — derivative-generation не применима, событие подтверждено без построения вариантов.`,
      );
      return;
    }

    // ADR-006 идемпотентность: appendVariant — $push, не upsert (см.
    // MediaAssetRepository) — повторный вызов handle() для того же события
    // (replay намеренный или после failed-attempt retry) без этой проверки
    // добавил бы ДУБЛИРУЮЩИЕСЯ записи variants того же type. Естественная
    // идемпотентность здесь — "уже есть все три варианта → это replay,
    // пропустить всю генерацию целиком", не только дедуп на записи.
    const asset = await this.mediaAssetRepository.findById(event.aggregateId);
    const existingTypes = new Set((asset?.variants ?? []).map((v) => v.type));
    const allVariantsAlreadyExist = ALL_VARIANT_TYPES.every((type) => existingTypes.has(type));
    if (allVariantsAlreadyExist) {
      this.logger.log(
        `MediaVerified для media_asset ${event.aggregateId.toString()}: все варианты уже построены (replay события) — пропускаю повторную генерацию.`,
      );
      return;
    }

    const originalBuffer = await this.storage.readObject({
      bucket: payload.bucket,
      key: payload.originalPath,
    });

    const variants = await this.imageVariantService.generateVariants(originalBuffer);

    // Derivative-варианты идут в ТОТ ЖЕ тип bucket, что и оригинал, не
    // всегда 'public' — приватность bucket'а (ADR-008 физическое
    // разделение) не должна теряться на derivative-шаге: если оригинал
    // почему-либо лежит в приватном bucket, публичные варианты туда же,
    // не в public bucket, иначе приватный asset получил бы публично
    // доступные производные.
    const version = 1; // Первая генерация; re-generation (например, после ручного пересжатия) — вне текущего прохода.
    for (const variant of variants) {
      const assetPath = `${event.aggregateId.toString()}/${variant.type}/${version}.webp`;
      await this.storage.putObject({
        bucket: payload.bucket,
        key: assetPath,
        body: variant.buffer,
        contentType: variant.contentType,
      });
      await this.mediaAssetRepository.appendVariant(event.aggregateId, {
        type: variant.type,
        assetPath,
        exifStripped: true,
      });
    }

    this.logger.log(
      `MediaVerified для media_asset ${event.aggregateId.toString()}: построено ${variants.length} derivative-вариантов (${variants.map((v) => v.type).join(', ')}), EXIF удалён.`,
    );
  }
}
