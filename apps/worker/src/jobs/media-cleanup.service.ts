import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MediaAssetRepository, MediaStorageService } from '@baza/media-storage';

const DEFAULT_TTL_HOURS = 24;
const DEFAULT_BATCH_LIMIT = 100;

export interface MediaCleanupResult {
  found: number;
  deleted: number;
  skipped: number;
  errors: number;
}

/**
 * ADR-008 Consequences: intent'ы, застрявшие в 'pending' дольше, чем
 * реалистичное окно "клиент когда-либо вернётся завершить загрузку" —
 * orphaned upload-intent'ы (presigned URL истёк, клиент закрыл вкладку,
 * ошибка сети до вызова confirm). MediaAssetRepository.findStalePending уже
 * существовал (ADR-008), но не имел ни одного вызывающего кода до этой
 * задачи — тот самый честный "TODO cleanup queue", теперь реализованный.
 *
 * TTL = 24 часа по умолчанию, env-configurable (MEDIA_ORPHAN_TTL_HOURS) —
 * НАМНОГО больше presigned URL TTL (5 минут, PRESIGNED_UPLOAD_TTL_SECONDS в
 * media-storage.service.ts) специально: короткое окно ловило бы гостя,
 * который начал загрузку, но confirm ещё не успел долететь до API (сетевая
 * задержка, ретрай клиента) — 24ч комфортный запас, чтобы НИКОГДА не
 * удалить asset, который клиент ещё может (хоть и с опозданием) подтвердить.
 *
 * Race-safe: claim через MediaAssetRepository.claimForCleanup (CAS, тот же
 * принцип, что MediaService.confirmUpload markVerified/markRejected) —
 * защищает от гонки с РЕАЛЬНЫМ гостем, чей confirmUpload срабатывает между
 * find() этого job'а и его собственной попыткой удаления. Если claim
 * проигран (гость выиграл гонку и уже сделал confirm) — asset "безопасно
 * пропущен", не ошибка.
 *
 * Failure handling: если storage-delete падает ПОСЛЕ успешного claim, Mongo-
 * документ НЕ удаляется — остаётся claimed (orphanCleanupClaimedAt
 * проставлен), следующий прогон job'а увидит протухший claim
 * (staleClaimCutoff в claimForCleanup) и повторит попытку. Никогда не
 * удаляем Mongo-запись раньше подтверждённого удаления объекта в storage —
 * иначе osiротевший объект остался бы в MinIO навсегда, ничем не
 * отслеживаемый (хуже, чем orphaned Mongo-документ, который сам cleanup же
 * и находит на каждом прогоне).
 *
 * НИКОГДА не трогает status:'verified' — full stop (findStalePending сам
 * фильтрует по status:'pending', этот инвариант проверяется дополнительно
 * тестами, не только запросом). status:'rejected' тоже не трогается —
 * product-decision по их ретеншену вне scope этой задачи.
 */
@Injectable()
export class MediaCleanupService {
  private readonly logger = new Logger(MediaCleanupService.name);

  constructor(
    private readonly mediaAssetRepository: MediaAssetRepository,
    private readonly storage: MediaStorageService,
    private readonly config: ConfigService,
  ) {}

  async run(options: { dryRun: boolean; batchLimit?: number }): Promise<MediaCleanupResult> {
    const ttlHours = Number(this.config.get('MEDIA_ORPHAN_TTL_HOURS') ?? DEFAULT_TTL_HOURS);
    const effectiveTtlHours = Number.isFinite(ttlHours) && ttlHours > 0 ? ttlHours : DEFAULT_TTL_HOURS;
    const cutoff = new Date(Date.now() - effectiveTtlHours * 60 * 60 * 1000);
    // Тот же cutoff используется и как staleClaimCutoff — прошлый claim
    // старше TTL-окна однозначно принадлежит упавшему/зависшему прогону,
    // не in-flight конкуренту (единственный этот job вызывается ops-cron'ом,
    // не постоянно работающий процесс — параллельных "живых" claim'ов на
    // момент запуска в норме быть не должно).
    const batchLimit = options.batchLimit ?? DEFAULT_BATCH_LIMIT;

    const candidates = await this.mediaAssetRepository.findStalePending(cutoff, batchLimit);
    const result: MediaCleanupResult = { found: candidates.length, deleted: 0, skipped: 0, errors: 0 };

    this.logger.log(
      `media cleanup run started: found=${result.found} cutoff=${cutoff.toISOString()} dryRun=${options.dryRun}`,
    );

    if (options.dryRun) {
      for (const candidate of candidates) {
        this.logger.log(`[dry-run] would clean up media_asset ${candidate._id.toString()} (createdAt=${candidate.createdAt.toISOString()})`);
      }
      return result;
    }

    for (const candidate of candidates) {
      try {
        const { modifiedCount } = await this.mediaAssetRepository.claimForCleanup(candidate._id, cutoff);
        if (modifiedCount === 0) {
          // Confirm выиграл гонку (asset больше не 'pending') ИЛИ другой
          // прогон уже держит свежий claim — оба случая: безопасно
          // пропущено, не ошибка.
          result.skipped += 1;
          continue;
        }

        await this.storage.deleteObject({ bucket: candidate.bucket, key: candidate.originalPath });
        await this.mediaAssetRepository.deletePermanently(candidate._id);
        result.deleted += 1;
      } catch (error) {
        // Storage-delete (или иная ошибка) упала ПОСЛЕ успешного claim —
        // документ остаётся claimed, следующий прогон retry'ит (см. класс
        // докстринг). Не пробрасываем — один упавший asset не должен
        // прерывать обработку остальных кандидатов batch'а.
        result.errors += 1;
        this.logger.error(
          `media cleanup failed for media_asset ${candidate._id.toString()}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }

    this.logger.log(
      `media cleanup run finished: found=${result.found} deleted=${result.deleted} skipped=${result.skipped} errors=${result.errors}`,
    );

    return result;
  }
}
