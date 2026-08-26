import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OutboxEventDocument, OutboxEventSchema, OutboxEventRepository } from '@baza/domain-events';
import { EventHandlerRegistry } from './event-handler.registry';
import { OutboxPollerService } from './outbox-poller.service';

@Module({
  imports: [MongooseModule.forFeature([{ name: OutboxEventDocument.name, schema: OutboxEventSchema }])],
  providers: [OutboxEventRepository, EventHandlerRegistry, OutboxPollerService],
  exports: [OutboxPollerService, EventHandlerRegistry],
})
export class OutboxModule {}
