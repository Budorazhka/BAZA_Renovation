import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  PublicRevealIdempotencyRecordDocument,
  PublicRevealIdempotencyRecordSchema,
} from './public-reveal-idempotency-record.schema';
import { PublicRevealIdempotencyRecordRepository } from './public-reveal-idempotency-record.repository';
import { PublicRevealIdempotencyService } from './public-reveal-idempotency.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PublicRevealIdempotencyRecordDocument.name, schema: PublicRevealIdempotencyRecordSchema },
    ]),
  ],
  providers: [PublicRevealIdempotencyRecordRepository, PublicRevealIdempotencyService],
  exports: [PublicRevealIdempotencyService],
})
export class PublicRevealIdempotencyModule {}
