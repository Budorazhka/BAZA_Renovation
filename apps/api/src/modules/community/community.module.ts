import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  CommunitySectionDocument,
  CommunitySectionSchema,
} from './schemas/community-section.schema';
import {
  CommunityThreadDocument,
  CommunityThreadSchema,
} from './schemas/community-thread.schema';
import {
  CommunityReplyDocument,
  CommunityReplySchema,
} from './schemas/community-reply.schema';
import {
  CommunityEventDocument,
  CommunityEventSchema,
} from './schemas/community-event.schema';
import { CommunitySectionRepository } from './repository/community-section.repository';
import { CommunityThreadRepository } from './repository/community-thread.repository';
import { CommunityReplyRepository } from './repository/community-reply.repository';
import { CommunityEventRepository } from './repository/community-event.repository';
import { CommunityService } from './community.service';
import { CommunityController } from './community.controller';
import { AuthorizationModule } from '../authorization/authorization.module';
import { OutboxModule } from '../outbox/outbox.module';
import { IdempotencyModule } from '../../shared/idempotency/idempotency.module';
import { OrganizationsModule } from '../organizations/organizations.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CommunitySectionDocument.name, schema: CommunitySectionSchema },
      { name: CommunityThreadDocument.name, schema: CommunityThreadSchema },
      { name: CommunityReplyDocument.name, schema: CommunityReplySchema },
      { name: CommunityEventDocument.name, schema: CommunityEventSchema },
    ]),
    AuthorizationModule,
    OutboxModule,
    IdempotencyModule,
    // OrganizationsService.getPositionSummary/getOrganizationById — тот же
    // cross-module паттерн, что DevelopmentsModule (ADR-001): подписать тему
    // и ответ реальным именем автора и организацией, не дефолтом.
    OrganizationsModule,
  ],
  controllers: [CommunityController],
  providers: [
    CommunitySectionRepository,
    CommunityThreadRepository,
    CommunityReplyRepository,
    CommunityEventRepository,
    CommunityService,
  ],
  exports: [
    CommunityService,
    CommunitySectionRepository,
    CommunityThreadRepository,
    CommunityReplyRepository,
    CommunityEventRepository,
  ],
})
export class CommunityModule {}
