import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { IdempotencyModule } from '../../shared/idempotency/idempotency.module';
import { AuditModule } from '../audit/audit.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { CrmModule } from '../crm/crm.module';
import { DevelopmentsModule } from '../developments/developments.module';
import { OutboxModule } from '../outbox/outbox.module';
import { BookingDocument, BookingSchema } from './schemas/booking.schema';
import { BookingLockDocument, BookingLockSchema } from './schemas/booking-lock.schema';
import { BookingRepository } from './repository/booking.repository';
import { BookingLockRepository } from './repository/booking-lock.repository';
import { BookingsService } from './bookings.service';
import { BookingsController } from './bookings.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: BookingDocument.name, schema: BookingSchema },
      { name: BookingLockDocument.name, schema: BookingLockSchema },
    ]),
    AuditModule,
    AuthorizationModule,
    CrmModule,
    DevelopmentsModule,
    IdempotencyModule,
    OutboxModule,
  ],
  controllers: [BookingsController],
  providers: [BookingRepository, BookingLockRepository, BookingsService],
})
export class BookingsModule {}
