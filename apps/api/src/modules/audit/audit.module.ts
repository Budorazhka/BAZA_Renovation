import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditEventDocument, AuditEventSchema } from './schemas/audit-event.schema';
import { AuditEventRepository } from './repository/audit-event.repository';
import { AuditService } from './audit.service';

@Module({
  imports: [MongooseModule.forFeature([{ name: AuditEventDocument.name, schema: AuditEventSchema }])],
  providers: [AuditEventRepository, AuditService],
  exports: [AuditService],
})
export class AuditModule {}
