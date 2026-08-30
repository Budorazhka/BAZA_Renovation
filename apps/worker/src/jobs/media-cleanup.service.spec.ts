import { Types } from 'mongoose';
import { MediaCleanupService } from './media-cleanup.service';
import type { MediaAssetRepository, MediaStorageService } from '@baza/media-storage';
import type { ConfigService } from '@nestjs/config';

function makeCandidate(overrides: Partial<{ _id: Types.ObjectId; bucket: 'private' | 'public'; originalPath: string; createdAt: Date }> = {}) {
  return {
    _id: overrides._id ?? new Types.ObjectId(),
    bucket: overrides.bucket ?? 'public',
    originalPath: overrides.originalPath ?? 'assetId/original.png',
    createdAt: overrides.createdAt ?? new Date('2026-01-01'),
  };
}

function makeConfig(overrides: Record<string, unknown> = {}): ConfigService {
  return { get: (key: string) => overrides[key] } as unknown as ConfigService;
}

describe('MediaCleanupService.run', () => {
  it('orphan-кандидат (pending, старше TTL) — claim успешен, storage-delete успешен, Mongo-документ удалён', async () => {
    const candidate = makeCandidate();
    const findStalePendingSpy = jest.fn().mockResolvedValue([candidate]);
    const claimForCleanupSpy = jest.fn().mockResolvedValue({ modifiedCount: 1 });
    const deletePermanentlySpy = jest.fn().mockResolvedValue(undefined);
    const deleteObjectSpy = jest.fn().mockResolvedValue(undefined);

    const service = new MediaCleanupService(
      {
        findStalePending: findStalePendingSpy,
        claimForCleanup: claimForCleanupSpy,
        deletePermanently: deletePermanentlySpy,
      } as unknown as MediaAssetRepository,
      { deleteObject: deleteObjectSpy } as unknown as MediaStorageService,
      makeConfig(),
    );

    const result = await service.run({ dryRun: false });

    expect(claimForCleanupSpy).toHaveBeenCalledWith(candidate._id, expect.any(Date));
    expect(deleteObjectSpy).toHaveBeenCalledWith({ bucket: 'public', key: 'assetId/original.png' });
    expect(deletePermanentlySpy).toHaveBeenCalledWith(candidate._id);
    expect(result).toEqual({ found: 1, deleted: 1, skipped: 0, errors: 0 });
  });

  it('confirm выиграл гонку (claim modifiedCount:0) — safely skipped, storage/Mongo delete НЕ вызываются', async () => {
    const candidate = makeCandidate();
    const claimForCleanupSpy = jest.fn().mockResolvedValue({ modifiedCount: 0 });
    const deletePermanentlySpy = jest.fn();
    const deleteObjectSpy = jest.fn();

    const service = new MediaCleanupService(
      {
        findStalePending: jest.fn().mockResolvedValue([candidate]),
        claimForCleanup: claimForCleanupSpy,
        deletePermanently: deletePermanentlySpy,
      } as unknown as MediaAssetRepository,
      { deleteObject: deleteObjectSpy } as unknown as MediaStorageService,
      makeConfig(),
    );

    const result = await service.run({ dryRun: false });

    expect(deleteObjectSpy).not.toHaveBeenCalled();
    expect(deletePermanentlySpy).not.toHaveBeenCalled();
    expect(result).toEqual({ found: 1, deleted: 0, skipped: 1, errors: 0 });
  });

  it('storage-delete падает после claim — Mongo-документ НЕ удаляется, ошибка учтена, batch продолжается', async () => {
    const candidateA = makeCandidate({ _id: new Types.ObjectId() });
    const candidateB = makeCandidate({ _id: new Types.ObjectId() });
    const claimForCleanupSpy = jest.fn().mockResolvedValue({ modifiedCount: 1 });
    const deletePermanentlySpy = jest.fn().mockResolvedValue(undefined);
    const deleteObjectSpy = jest
      .fn()
      .mockRejectedValueOnce(new Error('MinIO unavailable'))
      .mockResolvedValueOnce(undefined);

    const service = new MediaCleanupService(
      {
        findStalePending: jest.fn().mockResolvedValue([candidateA, candidateB]),
        claimForCleanup: claimForCleanupSpy,
        deletePermanently: deletePermanentlySpy,
      } as unknown as MediaAssetRepository,
      { deleteObject: deleteObjectSpy } as unknown as MediaStorageService,
      makeConfig(),
    );

    const result = await service.run({ dryRun: false });

    // Первый кандидат: claim успешен, storage delete упал — Mongo doc не тронут.
    expect(deletePermanentlySpy).toHaveBeenCalledTimes(1);
    expect(deletePermanentlySpy).toHaveBeenCalledWith(candidateB._id);
    expect(result).toEqual({ found: 2, deleted: 1, skipped: 0, errors: 1 });
  });

  it('dry-run: находит кандидатов, НЕ вызывает claim/storage-delete/Mongo-delete', async () => {
    const candidate = makeCandidate();
    const claimForCleanupSpy = jest.fn();
    const deletePermanentlySpy = jest.fn();
    const deleteObjectSpy = jest.fn();

    const service = new MediaCleanupService(
      {
        findStalePending: jest.fn().mockResolvedValue([candidate]),
        claimForCleanup: claimForCleanupSpy,
        deletePermanently: deletePermanentlySpy,
      } as unknown as MediaAssetRepository,
      { deleteObject: deleteObjectSpy } as unknown as MediaStorageService,
      makeConfig(),
    );

    const result = await service.run({ dryRun: true });

    expect(claimForCleanupSpy).not.toHaveBeenCalled();
    expect(deleteObjectSpy).not.toHaveBeenCalled();
    expect(deletePermanentlySpy).not.toHaveBeenCalled();
    expect(result).toEqual({ found: 1, deleted: 0, skipped: 0, errors: 0 });
  });

  it('пустой batch — идемпотентный re-run, ничего не находит, никаких ошибок', async () => {
    const service = new MediaCleanupService(
      {
        findStalePending: jest.fn().mockResolvedValue([]),
        claimForCleanup: jest.fn(),
        deletePermanently: jest.fn(),
      } as unknown as MediaAssetRepository,
      { deleteObject: jest.fn() } as unknown as MediaStorageService,
      makeConfig(),
    );

    const result = await service.run({ dryRun: false });

    expect(result).toEqual({ found: 0, deleted: 0, skipped: 0, errors: 0 });
  });

  it('использует MEDIA_ORPHAN_TTL_HOURS из ConfigService для вычисления cutoff', async () => {
    const findStalePendingSpy = jest.fn().mockResolvedValue([]);
    const service = new MediaCleanupService(
      { findStalePending: findStalePendingSpy, claimForCleanup: jest.fn(), deletePermanently: jest.fn() } as unknown as MediaAssetRepository,
      { deleteObject: jest.fn() } as unknown as MediaStorageService,
      makeConfig({ MEDIA_ORPHAN_TTL_HOURS: 1 }),
    );

    const before = Date.now();
    await service.run({ dryRun: false });

    const [cutoff] = findStalePendingSpy.mock.calls[0] as [Date, number];
    const expectedCutoffMs = before - 1 * 60 * 60 * 1000;
    // Допуск в несколько секунд на исполнение теста.
    expect(Math.abs(cutoff.getTime() - expectedCutoffMs)).toBeLessThan(5000);
  });
});
