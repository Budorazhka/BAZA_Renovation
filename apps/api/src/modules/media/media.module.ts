import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  MediaAssetDocument,
  MediaAssetSchema,
  MediaAssetRepository,
  MediaStorageService,
} from '@baza/media-storage';
import { MediaMimeVerifierService } from './media-mime-verifier.service';
import { MediaService } from './media.service';
import { MediaController } from './media.controller';
import { AuditModule } from '../audit/audit.module';
import { OutboxModule } from '../outbox/outbox.module';
import { AuthorizationModule } from '../authorization/authorization.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: MediaAssetDocument.name, schema: MediaAssetSchema }]),
    AuditModule,
    OutboxModule,
    AuthorizationModule,
  ],
  controllers: [MediaController],
  providers: [
    MediaAssetRepository,
    MediaStorageService,
    MediaMimeVerifierService,
    MediaService,
  ],
  exports: [MediaService],
})
export class MediaModule {}
