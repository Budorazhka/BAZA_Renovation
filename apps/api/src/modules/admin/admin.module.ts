import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MarketplacePublicationDocument, MarketplacePublicationSchema } from '@baza/publication';
import { AdminAccountDocument, AdminAccountSchema } from './schemas/admin-account.schema';
import { AdminAccountRepository } from './repository/admin-account.repository';
import { AdminPolicyService } from './admin-policy.service';
import { AdminAccountService } from './admin-account.service';
import { AdminPublicationService } from './admin-publication.service';
import { AdminPublicationController } from './admin-publication.controller';
import { AdminAccountController } from './admin-account.controller';
import { AuthorizationModule } from '../authorization/authorization.module';
import { PublicationModule } from '../publication/publication.module';
import { AuditModule } from '../audit/audit.module';
import { IdentityModule } from '../identity/identity.module';

/**
 * PermissionGrantRepository НЕ импортируется/регистрируется здесь напрямую
 * (test/architecture/module-boundaries.test.ts прямо это запрещает —
 * "модуль не импортирует repository другого модуля напрямую", ADR-001/002).
 * AdminAccountService пишет grants исключительно через
 * PolicyEvaluatorService.grant() (authorization-модуль владеет своим
 * repository, экспортирует только сервис поверх него) — тот же принцип,
 * что уже применяется к чтению прав (evaluate()).
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AdminAccountDocument.name, schema: AdminAccountSchema },
      // MarketplacePublicationDocument уже зарегистрирован в
      // PublicationModule, но MongooseModule.forFeature требует явной
      // регистрации в каждом модуле, использующем @InjectModel для этого
      // имени — тот же паттерн, что уже применён в CrmModule.
      { name: MarketplacePublicationDocument.name, schema: MarketplacePublicationSchema },
    ]),
    // PolicyEvaluatorService переиспользуется отсюда (не создаётся заново
    // как отдельный provider) — один DI-граф на весь процесс, не два
    // независимых инстанса с одинаковым поведением поверх той же коллекции.
    AuthorizationModule,
    PublicationModule,
    AuditModule,
    IdentityModule,
  ],
  controllers: [AdminPublicationController, AdminAccountController],
  providers: [AdminAccountRepository, AdminPolicyService, AdminAccountService, AdminPublicationService],
  exports: [AdminAccountRepository],
})
export class AdminModule {}
