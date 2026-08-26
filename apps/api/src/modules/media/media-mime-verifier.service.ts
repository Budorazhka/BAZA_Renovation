import { Injectable, Optional } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { ALLOWED_MIME_TYPES } from './media.constants';

export interface MimeVerificationResult {
  verified: boolean;
  mimeType?: string;
  checksum: string;
  rejectionReason?: string;
}

/**
 * Сигнатура распознавателя magic bytes — реализуется через `file-type` в
 * продакшене (см. detectFileTypeFromBuffer ниже), инъецируется отдельно от
 * самого MediaMimeVerifierService.verify(), чтобы:
 * (а) unit-тесты allowlist/checksum-логики не зависели от реальной ESM-
 * библиотеки в CJS Jest-окружении (ts-jest не транспилирует чужой ESM-код
 * в node_modules — отдельная проблема от продакшен Node-рантайма, где
 * динамический import() из CJS работает нормально);
 * (б) сама детекция MIME была заменяемой единицей, а не намертво вшитой
 * в бизнес-логику verify().
 */
export type FileTypeDetector = (buffer: Buffer) => Promise<{ mime: string } | undefined>;

/**
 * TypeScript с `module: "CommonJS"` (packages/tsconfig/nestjs.json)
 * downlevel-транспилирует ЛЮБОЙ `import(...)`, включая динамический,
 * в `Promise.resolve().then(() => require(...))` — что на рантайме есть
 * обычный `require()`, вызванный на чистом ESM-пакете (`file-type`,
 * package.json: "type":"module"), и падает с ERR_REQUIRE_ESM. Проверено
 * прямым просмотром dist/ после сборки — комментарий "используем
 * динамический import()" без этого приёма был бы ложным.
 *
 * `new Function(...)` — стандартный обходной путь: TypeScript не
 * распознаёт `import` внутри строки, переданной в конструктор Function,
 * как модульный синтаксис, и не трогает её при транспиляции. На рантайме
 * V8 компилирует эту строку как полноценный код, где `import()` —
 * настоящий динамический оператор ES-модулей, независимо от того, что
 * весь окружающий файл собран как CommonJS. Проверено не только чтением
 * dist/ (там действительно остаётся буквальный `import(specifier)`, без
 * downlevel в require), но и прямым runtime-запуском собранного
 * dist/modules/media/media-mime-verifier.service.js через `node -e`
 * с валидными PNG-байтами — реальная детекция сработала, ERR_REQUIRE_ESM
 * не возникает.
 */
const dynamicImport = new Function('specifier', 'return import(specifier)') as (
  specifier: string,
) => Promise<{ fileTypeFromBuffer: (buffer: Buffer) => Promise<{ mime: string } | undefined> }>;

export const detectFileTypeFromBuffer: FileTypeDetector = async (buffer) => {
  const { fileTypeFromBuffer } = await dynamicImport('file-type');
  return fileTypeFromBuffer(buffer);
};

/**
 * ADR-008: magic-byte MIME-проверка — единственный надёжный метод,
 * расширение файла и заявленный клиентом Content-Type оба тривиально
 * подделываются, поэтому не участвуют в этом решении вообще.
 */
@Injectable()
export class MediaMimeVerifierService {
  private readonly detectFileType: FileTypeDetector;

  /**
   * @Optional() — Nest не пытается резолвить FileTypeDetector через DI
   * (function type не имеет class-токена для emitDecoratorMetadata), без
   * @Optional() Nest бросил бы "can't resolve dependency" при старте
   * приложения. Продакшен-путь (реальный AppModule) не передаёт detector
   * явно нигде — всегда попадает в ветку default. Явная передача аргумента
   * используется только в unit-тестах через
   * `new MediaMimeVerifierService(fakeDetector)`.
   */
  constructor(@Optional() detectFileType?: FileTypeDetector) {
    this.detectFileType = detectFileType ?? detectFileTypeFromBuffer;
  }

  async verify(buffer: Buffer): Promise<MimeVerificationResult> {
    const detected = await this.detectFileType(buffer);
    const checksum = createHash('sha256').update(buffer).digest('hex');

    if (!detected) {
      return { verified: false, checksum, rejectionReason: 'MIME по magic bytes не распознан' };
    }

    if (!ALLOWED_MIME_TYPES.has(detected.mime)) {
      return {
        verified: false,
        mimeType: detected.mime,
        checksum,
        rejectionReason: `MIME ${detected.mime} не входит в allowlist разрешённых типов`,
      };
    }

    return { verified: true, mimeType: detected.mime, checksum };
  }
}
