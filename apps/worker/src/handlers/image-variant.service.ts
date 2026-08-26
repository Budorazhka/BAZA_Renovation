import { Injectable } from '@nestjs/common';
import sharp from 'sharp';
import type { MediaVariantType } from '@baza/media-storage';

export interface VariantSpec {
  type: MediaVariantType;
  maxDimension: number;
}

/**
 * ADR-008: три публичных варианта — thumbnail (списки/карточки поиска),
 * card (карточка объявления), detail (полноэкранный просмотр). Точные
 * пиксельные размеры нигде не зафиксированы владельцем/ADR (техническая
 * механика, не бизнес-решение) — взяты общепринятые для property-listing
 * сайтов значения, resize по длинной стороне с сохранением aspect ratio
 * (fit: 'inside', без upscale — withoutEnlargement).
 */
export const VARIANT_SPECS: VariantSpec[] = [
  { type: 'thumbnail', maxDimension: 320 },
  { type: 'card', maxDimension: 800 },
  { type: 'detail', maxDimension: 1600 },
];

export interface GeneratedVariant {
  type: MediaVariantType;
  buffer: Buffer;
  contentType: 'image/webp';
}

/**
 * ADR-008: "удаляет EXIF из публичных вариантов" — закрывает утечку
 * геолокации через метаданные фото (owner decision 25.08.2026, ADR-008
 * Security impact). EXIF-strip здесь достигается ОТСУТСТВИЕМ вызова
 * `.withMetadata()`, не отдельным шагом "удалить metadata" — проверено
 * прямым чтением lib/index.d.ts пакета sharp (не по памяти): "The default
 * behaviour, when withMetadata is not used, is to strip all metadata
 * [EXIF, XMP, IPTC]". Явный вызов withMetadata() где-либо в pipeline
 * сломал бы это требование — намеренно не вызывается нигде ниже.
 */
@Injectable()
export class ImageVariantService {
  async generateVariants(originalBuffer: Buffer): Promise<GeneratedVariant[]> {
    const results: GeneratedVariant[] = [];
    for (const spec of VARIANT_SPECS) {
      const buffer = await sharp(originalBuffer)
        .resize({ width: spec.maxDimension, height: spec.maxDimension, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer();
      results.push({ type: spec.type, buffer, contentType: 'image/webp' });
    }
    return results;
  }
}
