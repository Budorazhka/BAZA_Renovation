import sharp from 'sharp';
import { ImageVariantService, VARIANT_SPECS } from './image-variant.service';

/**
 * ADR-008 Security impact: EXIF-strip — не декоративное требование, это
 * приватность-мера (геолокация в EXIF снимка квартиры). Эти тесты
 * НАМЕРЕННО используют реальный sharp против реального изображения с
 * реально записанным EXIF — мок здесь дал бы ложную уверенность (можно
 * было бы замокать generateVariants так, что тест зелёный, а реальный
 * EXIF-strip сломан явным вызовом withMetadata() где-то в pipeline).
 */
describe('ImageVariantService', () => {
  /**
   * Валидное 800x600 JPEG с реально записанным EXIF GPS-полем — построено
   * программно через sharp({create}), не заимствовано откуда-то как fixture.
   */
  async function makeImageWithExif(): Promise<Buffer> {
    return sharp({
      create: { width: 800, height: 600, channels: 3, background: { r: 100, g: 150, b: 200 } },
    })
      .withExif({
        IFD0: { Make: 'TestCamera', Software: 'baza-test' },
      })
      .withMetadata()
      .jpeg()
      .toBuffer();
  }

  it('генерирует ровно 3 варианта (thumbnail/card/detail) для каждого вызова', async () => {
    const original = await makeImageWithExif();
    const service = new ImageVariantService();

    const variants = await service.generateVariants(original);

    expect(variants).toHaveLength(3);
    expect(variants.map((v) => v.type).sort()).toEqual(['card', 'detail', 'thumbnail'].sort());
  });

  it('удаляет EXIF из ВСЕХ сгенерированных вариантов, несмотря на EXIF в оригинале', async () => {
    const original = await makeImageWithExif();

    // Подтверждаем, что тестовая fixture действительно содержит EXIF —
    // иначе тест ниже был бы бессмысленным (проверял бы отсутствие того,
    // чего и так не было во входных данных).
    const originalMetadata = await sharp(original).metadata();
    expect(originalMetadata.exif).toBeDefined();

    const service = new ImageVariantService();
    const variants = await service.generateVariants(original);

    for (const variant of variants) {
      const metadata = await sharp(variant.buffer).metadata();
      expect(metadata.exif).toBeUndefined();
    }
  });

  it('конвертирует каждый вариант в WebP', async () => {
    const original = await makeImageWithExif();
    const service = new ImageVariantService();

    const variants = await service.generateVariants(original);

    for (const variant of variants) {
      expect(variant.contentType).toBe('image/webp');
      const metadata = await sharp(variant.buffer).metadata();
      expect(metadata.format).toBe('webp');
    }
  });

  it('не увеличивает изображение сверх оригинального размера (withoutEnlargement)', async () => {
    // Оригинал 800x600 меньше detail-спеки (1600) по обеим сторонам —
    // withoutEnlargement должен оставить detail-вариант как есть, не
    // растягивая маленькое фото до большего размера с потерей качества.
    const small = await sharp({
      create: { width: 100, height: 80, channels: 3, background: { r: 0, g: 0, b: 0 } },
    })
      .jpeg()
      .toBuffer();

    const service = new ImageVariantService();
    const variants = await service.generateVariants(small);
    const detail = variants.find((v) => v.type === 'detail')!;

    const metadata = await sharp(detail.buffer).metadata();
    expect(metadata.width).toBeLessThanOrEqual(100);
    expect(metadata.height).toBeLessThanOrEqual(80);
  });

  it('масштабирует по длинной стороне до maxDimension, сохраняя aspect ratio', async () => {
    // 1600x800 (2:1) → thumbnail maxDimension:320 → ожидается 320x160
    // (длинная сторона = maxDimension, короткая пропорционально).
    const wide = await sharp({
      create: { width: 1600, height: 800, channels: 3, background: { r: 50, g: 50, b: 50 } },
    })
      .jpeg()
      .toBuffer();

    const service = new ImageVariantService();
    const variants = await service.generateVariants(wide);
    const thumbnail = variants.find((v) => v.type === 'thumbnail')!;

    const metadata = await sharp(thumbnail.buffer).metadata();
    expect(metadata.width).toBe(320);
    expect(metadata.height).toBe(160);
  });

  it('VARIANT_SPECS содержит ровно thumbnail/card/detail с возрастающими maxDimension', () => {
    expect(VARIANT_SPECS.map((s) => s.type)).toEqual(['thumbnail', 'card', 'detail']);
    const dimensions = VARIANT_SPECS.map((s) => s.maxDimension);
    expect(dimensions).toEqual([...dimensions].sort((a, b) => a - b));
  });
});
