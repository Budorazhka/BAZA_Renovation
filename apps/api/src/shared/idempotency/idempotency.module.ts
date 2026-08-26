import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { IdempotencyRecordDocument, IdempotencyRecordSchema } from './idempotency-record.schema';
import { IdempotencyRecordRepository } from './idempotency-record.repository';
import { IdempotencyService } from './idempotency.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: IdempotencyRecordDocument.name, schema: IdempotencyRecordSchema },
    ]),
  ],
  providers: [IdempotencyRecordRepository, IdempotencyService],
  exports: [IdempotencyService],
})
export class IdempotencyModule {}
