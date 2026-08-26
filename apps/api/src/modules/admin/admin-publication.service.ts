import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import { MarketplacePublicationRepository } from '@baza/publication';
import { runInTransaction } from '../../shared/transactions/run-in-transaction';
import type { AdminContext } from '../../shared/admin/admin-context';
import { PublicationService } from '../publication/publication.service';
import { AdminPolicyService } from './admin-policy.service';

/**
 * D-06/OpenAPI `adminUnpublish`: первый реальный Admin critical action.
 * PublicationService.unpublish (command-слой) уже был написан generic по
 * sourceType в D-03 и уже принимает actorType:'admin_account' — этот
 * сервис не дублирует его логику, только добавляет Admin-специфичный слой
 * поверх (permission-проверка по динамическому resource/scope + reason).
 */
@Injectable()
export class AdminPublicationService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly publicationRepository: MarketplacePublicationRepository,
    private readonly publicationService: PublicationService,
    private readonly adminPolicy: AdminPolicyService,
  ) {}

  async unpublish(
    adminContext: AdminContext,
    params: { publicationId: Types.ObjectId; reason: string; correlationId: string },
  ): Promise<{
    id: string;
    sourceType: string;
    sourceId: string;
    status: string;
    slug: string | null;
    unpublishReason: string | null;
  }> {
    this.adminPolicy.requireReason(params.reason);

    const publication = await this.publicationRepository.findById(params.publicationId);
    if (!publication) {
      throw new NotFoundException('Publication not found');
    }

    /**
     * `[technical decision — 25.08.2026]`, не owner decision: resource =
     * publication.sourceType (`development`/`unit`/`listing`), action =
     * 'unpublish' — по аналогии с permission-matrix.md разд.2.2 примерами
     * (`listing.moderate.city`, `unit.price.override.domain`: resource.action.scope
     * тройка, scope — свойство САМОГО гранта, не статичный параметр запроса).
     * permission-matrix.md разд.4 иллюстрирует этот критичный action только
     * одним примером ("Listing unpublish (Admin)", grant `listing.unpublish.*`)
     * — здесь обобщено на все три sourceType, а не буквально ограничено
     * listing, потому что PublicationService/MarketplacePublication
     * архитектурно generic по всем трём с ADR-005: грант, выданный
     * конкретно на `listing.unpublish`, НЕ должен означать право снимать
     * публикации новостроек — это разные домены модерации по духу тех же
     * примеров composition раздела 2.2 ("Модератор вторички" vs "Админ
     * новостроек" — явно разные, не пересекающиеся наборы grants).
     * Требует подтверждения владельца при первом реальном использовании
     * Admin UI, не финализировано как единственно верное толкование.
     */
    const scopeValue = (publication.searchProjection as { city?: string } | undefined)?.city;

    await this.adminPolicy.requireGrant({
      adminContext,
      resource: publication.sourceType,
      action: 'unpublish',
      scopeValue,
    });

    await runInTransaction(this.connection, async (session) => {
      await this.publicationService.unpublish(
        {
          sourceType: publication.sourceType,
          sourceId: publication.sourceId,
          reason: params.reason,
          actorType: 'admin_account',
          actorId: new Types.ObjectId(adminContext.adminAccountId),
          correlationId: params.correlationId,
        },
        session,
      );
    });

    const updated = await this.publicationRepository.findById(params.publicationId);
    return {
      id: updated!._id.toString(),
      sourceType: updated!.sourceType,
      sourceId: updated!.sourceId.toString(),
      status: updated!.status,
      slug: updated!.slug ?? null,
      unpublishReason: updated!.unpublishReason ?? null,
    };
  }
}
