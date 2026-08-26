/**
 * Ambient-декларация вместо реального резолва типов пакета `file-type`.
 *
 * `file-type` — чистый ESM-пакет (`"type": "module"`), а apps/api
 * компилируется с `moduleResolution: "Node"` (packages/tsconfig/nestjs.json)
 * — этот legacy-резолвер не понимает `exports`-only ESM-пакеты и не находит
 * его типы (TS2307), хотя рантайм-код работает нормально через динамический
 * `import()` (см. media-mime-verifier.service.ts). Переключение
 * moduleResolution на "bundler"/"nodenext" — общая для всего monorepo
 * tsconfig-настройка (packages/tsconfig/base.json), непропорциональное
 * по риску изменение ради одного пакета. Здесь объявлена только та часть
 * API, которая реально используется — не полная переопись типов пакета.
 */
declare module 'file-type' {
  export interface FileTypeResult {
    ext: string;
    mime: string;
  }

  export function fileTypeFromBuffer(
    buffer: Uint8Array | ArrayBuffer,
  ): Promise<FileTypeResult | undefined>;
}
