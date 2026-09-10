import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OrganizationDocument, OrganizationSchema } from './schemas/organization.schema';
import { PositionDocument, PositionSchema } from './schemas/position.schema';
import { PositionAssignmentDocument, PositionAssignmentSchema } from './schemas/position-assignment.schema';
import { InvitationDocument, InvitationSchema } from './schemas/invitation.schema';
import { PositionProfileDocument, PositionProfileSchema } from './schemas/position-profile.schema';
import { OrganizationRepository } from './repository/organization.repository';
import { PositionRepository } from './repository/position.repository';
import { PositionAssignmentRepository } from './repository/position-assignment.repository';
import { InvitationRepository } from './repository/invitation.repository';
import { PositionProfileRepository } from './repository/position-profile.repository';
import { PositionAssignmentService } from './position-assignment.service';
import { OrganizationsService } from './organizations.service';
import { DefaultGrantsBackfillService } from './default-grants-backfill.service';
import { TeamService } from './team.service';
import { OrganizationsController } from './organizations.controller';
import { OrganizationOnboardingController } from './organization-onboarding.controller';
import { TeamController } from './team.controller';
import { InvitationController } from './invitation.controller';
import { MeController } from './me.controller';
import { IdentityModule } from '../identity/identity.module';
import { AuditModule } from '../audit/audit.module';
import { OutboxModule } from '../outbox/outbox.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { MediaModule } from '../media/media.module';
import { RateLimitModule } from '../../shared/rate-limit/rate-limit.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: OrganizationDocument.name, schema: OrganizationSchema },
      { name: PositionDocument.name, schema: PositionSchema },
      { name: PositionAssignmentDocument.name, schema: PositionAssignmentSchema },
      { name: InvitationDocument.name, schema: InvitationSchema },
      { name: PositionProfileDocument.name, schema: PositionProfileSchema },
    ]),
    IdentityModule,
    AuditModule,
    OutboxModule,
    AuthorizationModule,
    MediaModule,
    RateLimitModule,
  ],
  controllers: [
    OrganizationsController,
    OrganizationOnboardingController,
    TeamController,
    InvitationController,
    MeController,
  ],
  providers: [
    OrganizationRepository,
    PositionRepository,
    PositionAssignmentRepository,
    InvitationRepository,
    PositionProfileRepository,
    PositionAssignmentService,
    OrganizationsService,
    DefaultGrantsBackfillService,
    TeamService,
  ],
  exports: [PositionAssignmentService, OrganizationsService],
})
export class OrganizationsModule {}
