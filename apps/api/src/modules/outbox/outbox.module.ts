import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OutboxEventDocument, OutboxEventSchema, OutboxEventRepository } from '@baza/domain-events';
import { OutboxService } from './outbox.service';

@Module({
  imports: [MongooseModule.forFeature([{ name: OutboxEventDocument.name, schema: OutboxEventSchema }])],
  providers: [OutboxEventRepository, OutboxService],
  exports: [OutboxService],
})
export class OutboxModule {}
