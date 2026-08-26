import { MediaMimeVerifierService, type FileTypeDetector } from './media-mime-verifier.service';

/**
 * ADR-008: magic-byte — единственный источник истины для MIME. Реальная
 * детекция (`file-type` библиотека) не тестируется здесь — это чужой,
 * уже протестированный код (и чистый ESM-пакет, который ts-jest не
 * транспилирует внутри node_modules, см. комментарий в
 * media-mime-verifier.service.ts). Тестируется MediaMimeVerifierService'а
 * СОБСТВЕННАЯ логика: allowlist-фильтрация, checksum, rejection reasons —
 * через инъецируемый fake detector с известным результатом.
 */
describe('MediaMimeVerifierService', () => {
  function makeDetector(result: { mime: string } | undefined): FileTypeDetector {
    return jest.fn().mockResolvedValue(result);
  }

  it('принимает MIME, входящий в allowlist', async () => {
    const service = new MediaMimeVerifierService(makeDetector({ mime: 'image/png' }));
    const result = await service.verify(Buffer.from('fake-png-bytes'));

    expect(result.verified).toBe(true);
    expect(result.mimeType).toBe('image/png');
    expect(result.checksum).toHaveLength(64); // sha256 hex
  });

  it('отклоняет буфер без распознанной detector-ом сигнатуры', async () => {
    const service = new MediaMimeVerifierService(makeDetector(undefined));
    const result = await service.verify(Buffer.from('plain text, not any known format'));

    expect(result.verified).toBe(false);
    expect(result.mimeType).toBeUndefined();
    expect(result.rejectionReason).toMatch(/не распознан/);
  });

  it('отклоняет MIME, реально распознанный, но не входящий в allowlist (например, ZIP)', async () => {
    const service = new MediaMimeVerifierService(makeDetector({ mime: 'application/zip' }));
    const result = await service.verify(Buffer.from('fake-zip-bytes'));

    expect(result.verified).toBe(false);
    expect(result.mimeType).toBe('application/zip');
    expect(result.rejectionReason).toMatch(/allowlist/);
  });

  it('вычисляет одинаковый checksum для идентичных байтов вне зависимости от MIME-результата', async () => {
    const bytes = Buffer.from('identical-content');
    const serviceA = new MediaMimeVerifierService(makeDetector({ mime: 'image/png' }));
    const serviceB = new MediaMimeVerifierService(makeDetector(undefined));

    const resultA = await serviceA.verify(bytes);
    const resultB = await serviceB.verify(Buffer.from(bytes));

    expect(resultA.checksum).toBe(resultB.checksum);
  });

  it('конструктор без явного detector не падает (production DI-путь через @Optional())', () => {
    // Не вызывает verify() — это утянуло бы реальный ESM file-type в Jest
    // (см. комментарий в media-mime-verifier.service.ts). Проверяет только
    // то, что @Optional()-параметр действительно опционален на практике,
    // не только по типу; сама детекция через реальный file-type проверяется
    // integration-тестом, не здесь.
    expect(() => new MediaMimeVerifierService()).not.toThrow();
  });
});
