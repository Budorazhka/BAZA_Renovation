import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { LmsItemDocument, LmsItemSchema } from './schemas/lms-item.schema';
import { LmsCourseDocument, LmsCourseSchema } from './schemas/lms-course.schema';
import { LmsProgressDocument, LmsProgressSchema } from './schemas/lms-progress.schema';
import { LmsItemRepository } from './repository/lms-item.repository';
import { LmsCourseRepository } from './repository/lms-course.repository';
import { LmsProgressRepository } from './repository/lms-progress.repository';
import { LmsService } from './lms.service';
import { LmsController } from './lms.controller';
import { AuthorizationModule } from '../authorization/authorization.module';
import { OutboxModule } from '../outbox/outbox.module';
import { IdempotencyModule } from '../../shared/idempotency/idempotency.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: LmsItemDocument.name, schema: LmsItemSchema },
      { name: LmsCourseDocument.name, schema: LmsCourseSchema },
      { name: LmsProgressDocument.name, schema: LmsProgressSchema },
    ]),
    AuthorizationModule,
    OutboxModule,
    IdempotencyModule,
  ],
  controllers: [LmsController],
  providers: [
    LmsItemRepository,
    LmsCourseRepository,
    LmsProgressRepository,
    LmsService,
  ],
  exports: [LmsService, LmsItemRepository, LmsCourseRepository, LmsProgressRepository],
})
export class LmsModule {}
