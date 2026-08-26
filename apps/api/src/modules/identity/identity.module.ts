import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { IdentityDocument, IdentitySchema } from './schemas/identity.schema';
import { SessionDocument, SessionSchema } from './schemas/session.schema';
import { ProductAccessDocument, ProductAccessSchema } from './schemas/product-access.schema';
import { SessionRepository } from './repository/session.repository';
import { IdentityRepository } from './repository/identity.repository';
import { ProductAccessRepository } from './repository/product-access.repository';
import { SessionService } from './session.service';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: IdentityDocument.name, schema: IdentitySchema },
      { name: SessionDocument.name, schema: SessionSchema },
      { name: ProductAccessDocument.name, schema: ProductAccessSchema },
    ]),
  ],
  controllers: [AuthController],
  providers: [SessionRepository, IdentityRepository, ProductAccessRepository, SessionService, AuthService],
  exports: [SessionService, AuthService],
})
export class IdentityModule {}
