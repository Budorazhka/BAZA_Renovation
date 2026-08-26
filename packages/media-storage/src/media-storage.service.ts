import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { MediaBucket } from './schemas/media-asset.schema';

const PRESIGNED_UPLOAD_TTL_SECONDS = 300;
const PRESIGNED_DOWNLOAD_TTL_SECONDS = 300;

/**
 * ADR-008: тонкая обёртка над S3-совместимым (MinIO) клиентом. Приватный/
 * публичный buckets — физически разные bucket-имена, не одна коллекция с
 * access-правилами на объект (defense-in-depth: ошибка в access-policy кода
 * не делает приватный документ публично доступным, поскольку он физически
 * не в том bucket, который вообще выдаётся публично).
 *
 * Живёт в @baza/media-storage (не в apps/api), потому что и API-процесс
 * (presigned upload/download URL для клиента, чтение оригинала для MIME
 * verify), и worker-процесс (чтение оригинала + запись сгенерированных
 * derivative-вариантов) обращаются к ОДНОЙ и той же S3/MinIO конфигурации
 * — тот же принцип, что уже применён к OutboxEventRepository
 * (@baza/domain-events): дублирование клиент-кода в двух apps создало бы
 * риск рассинхронизации конфигурации между процессами.
 */
@Injectable()
export class MediaStorageService {
  private readonly client: S3Client;
  private readonly bucketNames: Record<MediaBucket, string>;

  constructor(private readonly config: ConfigService) {
    this.client = new S3Client({
      endpoint: this.config.getOrThrow<string>('MINIO_ENDPOINT'),
      region: 'us-east-1', // MinIO игнорирует region, но SDK требует непустое значение.
      forcePathStyle: true, // MinIO — path-style ({endpoint}/{bucket}/{key}), не virtual-hosted.
      credentials: {
        accessKeyId: this.config.getOrThrow<string>('MINIO_ACCESS_KEY'),
        secretAccessKey: this.config.getOrThrow<string>('MINIO_SECRET_KEY'),
      },
    });
    this.bucketNames = {
      private: this.config.getOrThrow<string>('MINIO_BUCKET_PRIVATE'),
      public: this.config.getOrThrow<string>('MINIO_BUCKET_PUBLIC'),
    };
  }

  /**
   * Короткоживущая presigned URL на ПРЯМУЮ загрузку клиента в storage
   * (ADR-008: файл не проходит через API-процесс целиком).
   */
  async createUploadUrl(params: {
    bucket: MediaBucket;
    key: string;
    contentType: string;
  }): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucketNames[params.bucket],
      Key: params.key,
      ContentType: params.contentType,
    });
    return getSignedUrl(this.client, command, { expiresIn: PRESIGNED_UPLOAD_TTL_SECONDS });
  }

  /**
   * Постоянный публичный URL готового объекта в PUBLIC bucket (team-users
   * avatar и любой другой публичный derivative). НЕ presigned — public
   * bucket по определению открыт, подписывать URL к нему нет смысла (в
   * отличие от createDownloadUrl ниже, единственно для private bucket).
   * MINIO_PUBLIC_BASE_URL — отдельная env-переменная (не MINIO_ENDPOINT
   * напрямую): в dev совпадает с MinIO-адресом, в проде указывает на
   * CDN/прокси перед storage, не жёстко привязывает клиентские URL к
   * инфраструктурному адресу MinIO.
   */
  getPublicUrl(key: string): string {
    const base = this.config.getOrThrow<string>('MINIO_PUBLIC_BASE_URL');
    return `${base.replace(/\/$/, '')}/${key}`;
  }

  /**
   * Короткоживущая signed URL на скачивание — для приватных документов
   * (ADR-008: никогда не постоянный публичный адрес, даже "неугадываемый").
   */
  async createDownloadUrl(params: { bucket: MediaBucket; key: string }): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucketNames[params.bucket],
      Key: params.key,
    });
    return getSignedUrl(this.client, command, { expiresIn: PRESIGNED_DOWNLOAD_TTL_SECONDS });
  }

  /**
   * Считывает объект целиком в память для magic-byte верификации —
   * приемлемо на MVP-масштабе (см. Media module размерные лимиты в
   * media.constants.ts); для видео/крупных файлов достаточно первых байт,
   * но GetObject с Range здесь не используется намеренно: checksum-подсчёт
   * (следующий шаг того же confirm-flow) всё равно требует полного файла,
   * два отдельных частичных чтения были бы менее эффективны, чем одно
   * полное для MVP-объёмов (лимиты в media.constants.ts).
   */
  async readObject(params: { bucket: MediaBucket; key: string }): Promise<Buffer> {
    const command = new GetObjectCommand({
      Bucket: this.bucketNames[params.bucket],
      Key: params.key,
    });
    const response = await this.client.send(command);
    const body = response.Body;
    if (!body) {
      throw new Error(`MediaStorageService.readObject: пустой Body для ${params.bucket}/${params.key}`);
    }
    const chunks: Buffer[] = [];
    for await (const chunk of body as AsyncIterable<Buffer>) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  /**
   * Запись объекта — worker-side (сгенерированные derivative-варианты).
   * Server-side write, не presigned URL — worker уже прошёл через
   * markProcessing claim, дополнительная presigned-URL-косвенность здесь
   * не нужна (в отличие от клиентского upload-flow, где presigned URL
   * снимает нагрузку с API-процесса, ADR-008).
   */
  async putObject(params: {
    bucket: MediaBucket;
    key: string;
    body: Buffer;
    contentType: string;
  }): Promise<void> {
    const command = new PutObjectCommand({
      Bucket: this.bucketNames[params.bucket],
      Key: params.key,
      Body: params.body,
      ContentType: params.contentType,
    });
    await this.client.send(command);
  }
}
