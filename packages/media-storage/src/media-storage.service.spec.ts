import { S3Client } from '@aws-sdk/client-s3';
import { Readable } from 'node:stream';
import { MediaStorageService } from './media-storage.service';
import type { ConfigService } from '@nestjs/config';

function makeConfigService(overrides: Record<string, string> = {}): ConfigService {
  const values: Record<string, string> = {
    MINIO_ENDPOINT: 'http://localhost:9000',
    MINIO_ACCESS_KEY: 'test-access',
    MINIO_SECRET_KEY: 'test-secret',
    MINIO_BUCKET_PRIVATE: 'baza-private-test',
    MINIO_BUCKET_PUBLIC: 'baza-public-test',
    ...overrides,
  };
  return {
    getOrThrow: (key: string) => {
      const value = values[key];
      if (value === undefined) throw new Error(`Missing config: ${key}`);
      return value;
    },
  } as unknown as ConfigService;
}

/**
 * Не мокирует S3Client целиком (не через aws-sdk-client-mock — не хотим
 * тянуть ещё одну зависимость только ради теста) — вместо этого spy на
 * S3Client.prototype.send, реальный конструктор S3Client вызывается,
 * реальный сетевой вызов — нет.
 */
describe('MediaStorageService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('резолвит private/public bucket-имена из ConfigService', async () => {
    const sendSpy = jest.spyOn(S3Client.prototype, 'send').mockResolvedValue({
      Body: Readable.from([Buffer.from('data')]),
    } as never);

    const service = new MediaStorageService(makeConfigService());
    await service.readObject({ bucket: 'private', key: 'x/original.png' });

    const command = sendSpy.mock.calls[0]![0] as { input: { Bucket: string; Key: string } };
    expect(command.input.Bucket).toBe('baza-private-test');
    expect(command.input.Key).toBe('x/original.png');
  });

  it('readObject собирает Body-поток в единый Buffer', async () => {
    jest.spyOn(S3Client.prototype, 'send').mockResolvedValue({
      Body: Readable.from([Buffer.from('hello '), Buffer.from('world')]),
    } as never);

    const service = new MediaStorageService(makeConfigService());
    const result = await service.readObject({ bucket: 'public', key: 'x' });

    expect(result.toString('utf-8')).toBe('hello world');
  });

  it('readObject бросает, если Body отсутствует в ответе', async () => {
    jest.spyOn(S3Client.prototype, 'send').mockResolvedValue({ Body: undefined } as never);

    const service = new MediaStorageService(makeConfigService());

    await expect(service.readObject({ bucket: 'public', key: 'x' })).rejects.toThrow(/пустой Body/);
  });

  it('putObject отправляет Bucket/Key/Body/ContentType в public bucket', async () => {
    const sendSpy = jest.spyOn(S3Client.prototype, 'send').mockResolvedValue({} as never);

    const service = new MediaStorageService(makeConfigService());
    await service.putObject({
      bucket: 'public',
      key: 'assetId/thumbnail/1.webp',
      body: Buffer.from('webp-bytes'),
      contentType: 'image/webp',
    });

    const command = sendSpy.mock.calls[0]![0] as {
      input: { Bucket: string; Key: string; Body: Buffer; ContentType: string };
    };
    expect(command.input.Bucket).toBe('baza-public-test');
    expect(command.input.Key).toBe('assetId/thumbnail/1.webp');
    expect(command.input.ContentType).toBe('image/webp');
  });

  it('конструктор бросает, если обязательная env-переменная отсутствует', () => {
    const incompleteConfig = makeConfigService({ MINIO_ENDPOINT: undefined as unknown as string });
    expect(() => new MediaStorageService(incompleteConfig)).toThrow(/Missing config/);
  });

  it('deleteObject отправляет Bucket/Key для приватного bucket', async () => {
    const sendSpy = jest.spyOn(S3Client.prototype, 'send').mockResolvedValue({} as never);

    const service = new MediaStorageService(makeConfigService());
    await service.deleteObject({ bucket: 'private', key: 'assetId/original.png' });

    const command = sendSpy.mock.calls[0]![0] as { input: { Bucket: string; Key: string } };
    expect(command.input.Bucket).toBe('baza-private-test');
    expect(command.input.Key).toBe('assetId/original.png');
  });

  describe('getPublicUrl', () => {
    it('строит URL из MINIO_PUBLIC_BASE_URL + key, не привязываясь к MINIO_ENDPOINT', () => {
      const service = new MediaStorageService(
        makeConfigService({ MINIO_PUBLIC_BASE_URL: 'https://cdn.example.com/baza-public' }),
      );

      const url = service.getPublicUrl('assetId/card/1.webp');

      expect(url).toBe('https://cdn.example.com/baza-public/assetId/card/1.webp');
    });

    it('обрезает лишний завершающий слэш в base URL', () => {
      const service = new MediaStorageService(
        makeConfigService({ MINIO_PUBLIC_BASE_URL: 'https://cdn.example.com/baza-public/' }),
      );

      const url = service.getPublicUrl('assetId/card/1.webp');

      expect(url).toBe('https://cdn.example.com/baza-public/assetId/card/1.webp');
    });

    it('бросает, если MINIO_PUBLIC_BASE_URL отсутствует', () => {
      const service = new MediaStorageService(
        makeConfigService({ MINIO_PUBLIC_BASE_URL: undefined as unknown as string }),
      );

      expect(() => service.getPublicUrl('assetId/card/1.webp')).toThrow(/Missing config/);
    });
  });
});
