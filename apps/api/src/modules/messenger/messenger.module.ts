import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MessengerAccountDocument, MessengerAccountSchema } from './schemas/messenger-account.schema';
import { MessengerDialogDocument, MessengerDialogSchema } from './schemas/messenger-dialog.schema';
import { MessengerMessageDocument, MessengerMessageSchema } from './schemas/messenger-message.schema';
import { MessengerAccountRepository } from './repository/messenger-account.repository';
import { MessengerDialogRepository } from './repository/messenger-dialog.repository';
import { MessengerMessageRepository } from './repository/messenger-message.repository';
import { MessengerService } from './messenger.service';
import { MessengerController } from './messenger.controller';
import { AuthorizationModule } from '../authorization/authorization.module';
import { AuditModule } from '../audit/audit.module';
import { OutboxModule } from '../outbox/outbox.module';
import { CrmModule } from '../crm/crm.module';
import { MediaModule } from '../media/media.module';
import { IdempotencyModule } from '../../shared/idempotency/idempotency.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: MessengerAccountDocument.name, schema: MessengerAccountSchema },
      { name: MessengerDialogDocument.name, schema: MessengerDialogSchema },
      { name: MessengerMessageDocument.name, schema: MessengerMessageSchema },
    ]),
    AuthorizationModule,
    AuditModule,
    OutboxModule,
    CrmModule,
    MediaModule,
    IdempotencyModule,
  ],
  controllers: [MessengerController],
  providers: [
    MessengerAccountRepository,
    MessengerDialogRepository,
    MessengerMessageRepository,
    MessengerService,
  ],
  exports: [MessengerService],
})
export class MessengerModule {}
