import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { MediaAssetDocument, MediaAssetSchema, MediaAssetRepository, MediaStorageService } from '@baza/media-storage';
import { MediaCleanupService } from './media-cleanup.service';

/**
 * Отдельный минимальный модуль (не HandlersModule) — cleanup-job запускается
 * как самостоятельный процесс (media-cleanup.command.ts), не как часть
 * постоянно работающего outbox-poller'а worker'а, поэтому не нуждается ни в
 * OutboxModule, ни в handler-специфичных repository (Development/
 * PropertyAsset/Publication) — только media_assets + MediaStorageService.
 */
@Module({
  imports: [ConfigModule, MongooseModule.forFeature([{ name: MediaAssetDocument.name, schema: MediaAssetSchema }])],
  providers: [MediaAssetRepository, MediaStorageService, MediaCleanupService],
  exports: [MediaCleanupService],
})
export class MediaCleanupModule {}
