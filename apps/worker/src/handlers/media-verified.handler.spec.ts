import { Types } from 'mongoose';
import { MediaVerifiedHandler } from './media-verified.handler';
import type { MediaAssetRepository, MediaStorageService } from '@baza/media-storage';
import type { ImageVariantService } from './image-variant.service';

function makeEvent(payload: Record<string, unknown>) {
  return {
    aggregateId: new Types.ObjectId(),
    payload,
  } as never;
}

describe('MediaVerifiedHandler', () => {
  it('пропускает derivative-generation для non-image MIME (например, PDF)', async () => {
    const readObjectSpy = jest.fn();
    const generateVariantsSpy = jest.fn();
    const putObjectSpy = jest.fn();
    const findByIdSpy = jest.fn();

    const handler = new MediaVerifiedHandler(
      { findById: findByIdSpy, appendVariant: jest.fn() } as unknown as MediaAssetRepository,
      { readObject: readObjectSpy, putObject: putObjectSpy } as unknown as MediaStorageService,
      { generateVariants: generateVariantsSpy } as unknown as ImageVariantService,
    );

    await handler.handle(
      makeEvent({ bucket: 'private', originalPath: 'x/original.pdf', mimeType: 'application/pdf', purpose: 'agency_document' }),
    );

    expect(findByIdSpy).not.toHaveBeenCalled();
    expect(readObjectSpy).not.toHaveBeenCalled();
    expect(generateVariantsSpy).not.toHaveBeenCalled();
    expect(putObjectSpy).not.toHaveBeenCalled();
  });

  /**
   * ADR-006 идемпотентность: appendVariant — $push, не upsert. Replay
   * события (или повторная попытка после failed-attempt) для asset'а,
   * который УЖЕ имеет все три варианта, не должен генерировать заново
   * (дублировал бы записи variants того же type).
   */
  it('пропускает повторную генерацию, если asset уже имеет все три варианта (replay/retry)', async () => {
    const readObjectSpy = jest.fn();
    const generateVariantsSpy = jest.fn();
    const findByIdSpy = jest.fn().mockResolvedValue({
      variants: [
        { type: 'thumbnail', assetPath: 'x', exifStripped: true },
        { type: 'card', assetPath: 'y', exifStripped: true },
        { type: 'detail', assetPath: 'z', exifStripped: true },
      ],
    });

    const handler = new MediaVerifiedHandler(
      { findById: findByIdSpy, appendVariant: jest.fn() } as unknown as MediaAssetRepository,
      { readObject: readObjectSpy, putObject: jest.fn() } as unknown as MediaStorageService,
      { generateVariants: generateVariantsSpy } as unknown as ImageVariantService,
    );

    await handler.handle(
      makeEvent({ bucket: 'public', originalPath: 'x/original.png', mimeType: 'image/png', purpose: 'unit_photo' }),
    );

    expect(readObjectSpy).not.toHaveBeenCalled();
    expect(generateVariantsSpy).not.toHaveBeenCalled();
  });

  it('генерирует все три варианта, записывает их в storage и appendVariant для каждого', async () => {
    const findByIdSpy = jest.fn().mockResolvedValue({ variants: [] });
    const readObjectSpy = jest.fn().mockResolvedValue(Buffer.from('fake-original-bytes'));
    const generateVariantsSpy = jest.fn().mockResolvedValue([
      { type: 'thumbnail', buffer: Buffer.from('t'), contentType: 'image/webp' },
      { type: 'card', buffer: Buffer.from('c'), contentType: 'image/webp' },
      { type: 'detail', buffer: Buffer.from('d'), contentType: 'image/webp' },
    ]);
    const putObjectSpy = jest.fn().mockResolvedValue(undefined);
    const appendVariantSpy = jest.fn().mockResolvedValue(undefined);

    const event = makeEvent({ bucket: 'public', originalPath: 'abc/original.jpg', mimeType: 'image/jpeg', purpose: 'unit_photo' });

    const handler = new MediaVerifiedHandler(
      { findById: findByIdSpy, appendVariant: appendVariantSpy } as unknown as MediaAssetRepository,
      { readObject: readObjectSpy, putObject: putObjectSpy } as unknown as MediaStorageService,
      { generateVariants: generateVariantsSpy } as unknown as ImageVariantService,
    );

    await handler.handle(event);

    expect(readObjectSpy).toHaveBeenCalledWith({ bucket: 'public', key: 'abc/original.jpg' });
    expect(putObjectSpy).toHaveBeenCalledTimes(3);
    expect(appendVariantSpy).toHaveBeenCalledTimes(3);
    expect(appendVariantSpy).toHaveBeenCalledWith(
      (event as { aggregateId: Types.ObjectId }).aggregateId,
      expect.objectContaining({ type: 'thumbnail', exifStripped: true }),
    );
  });

  /**
   * ADR-008: приватный/публичный buckets физически разделены — derivative-
   * варианты не должны "утекать" в public bucket, если оригинал приватный.
   */
  it('пишет derivative-варианты в ТОТ ЖЕ bucket, что и оригинал (private остаётся private)', async () => {
    const findByIdSpy = jest.fn().mockResolvedValue({ variants: [] });
    const putObjectSpy = jest.fn().mockResolvedValue(undefined);

    const handler = new MediaVerifiedHandler(
      { findById: findByIdSpy, appendVariant: jest.fn() } as unknown as MediaAssetRepository,
      {
        readObject: jest.fn().mockResolvedValue(Buffer.from('bytes')),
        putObject: putObjectSpy,
      } as unknown as MediaStorageService,
      {
        generateVariants: jest.fn().mockResolvedValue([
          { type: 'thumbnail', buffer: Buffer.from('t'), contentType: 'image/webp' },
        ]),
      } as unknown as ImageVariantService,
    );

    await handler.handle(
      makeEvent({ bucket: 'private', originalPath: 'x/original.png', mimeType: 'image/png', purpose: 'hypothetical_private_photo' }),
    );

    expect(putObjectSpy).toHaveBeenCalledWith(expect.objectContaining({ bucket: 'private' }));
  });
});
