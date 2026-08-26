import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PermissionGrantDocument, PermissionGrantSchema } from './schemas/permission-grant.schema';
import { PermissionGrantRepository } from './repository/permission-grant.repository';
import { PolicyEvaluatorService } from './policy-evaluator.service';
import { PermissionGuard } from './permission.guard';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: PermissionGrantDocument.name, schema: PermissionGrantSchema }]),
  ],
  providers: [PermissionGrantRepository, PolicyEvaluatorService, PermissionGuard],
  exports: [PolicyEvaluatorService, PermissionGuard],
})
export class AuthorizationModule {}
