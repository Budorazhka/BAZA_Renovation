import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { Types } from 'mongoose';
import { MarketplacePublicationRepository } from '@baza/publication';

const DEFAULT_LIST_LIMIT = 20;
const MAX_LIST_LIMIT = 100;

/**
 * D-04/OpenAPI v1-first-vertical-slice.yaml: публичные marketplace
 * endpoints — БЕЗ TenantGuard/PermissionGuard (@Controller() без
 * @UseGuards намеренно, ADR-002 требование: публичные endpoint'ы не
 * tenant-scoped). Читает ИСКЛЮЧИТЕЛЬНО MarketplacePublication —
 * никогда напрямую canonical-коллекции (Development/Unit) — ADR-005:
 * "публикация не читается напрямую из canonical-сущностей на каждый
 * HTTP-запрос".
 *
 * Реальный SSR/metadata/schema.org рендеринг — задача marketplace-web
 * приложения (D-04, не начато в этой сессии), этот controller отдаёт
 * только JSON API, который такое приложение будет потреблять.
 */
@Controller('public/developments')
export class PublicController {
  constructor(private readonly publicationRepository: MarketplacePublicationRepository) {}

  @Get()
  async searchPublicDevelopments(
    @Query('cursor') cursor?: string,
    @Query('limit') limitParam?: string,
    @Query('city') city?: string,
    @Query('bbox') bboxParam?: string,
  ) {
    const limit = Math.min(limitParam ? Number(limitParam) : DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT);
    const bbox = bboxParam ? parseBbox(bboxParam) : undefined;

    const items = await this.publicationRepository.listPublished({
      cursor: cursor ? new Types.ObjectId(cursor) : undefined,
      limit,
      city,
      bbox,
    });

    const nextCursor = items.length === limit ? items[items.length - 1]!._id.toString() : null;

    return {
      items: items.map(toPublicCard),
      nextCursor,
    };
  }

  @Get(':slug')
  async getPublicDevelopment(@Param('slug') slug: string) {
    const publication = await this.publicationRepository.findBySlug(slug);
    if (!publication) {
      throw new NotFoundException('Publication not found');
    }
    return toPublicCard(publication);
  }
}

/**
 * ADR-005: только whitelist-поля, никогда внутренние комиссии/notes/
 * tenant-only контакты — но здесь МАППЕР УЖЕ ПРИМЕНЁН worker'ом на этапе
 * сборки денормализованной проекции (denormalizedFields содержит только
 * то, что worker явно туда положил через свой whitelist mapper), эта
 * функция просто разворачивает уже безопасную структуру документа
 * MarketplacePublication в HTTP response форму, не решает заново, что
 * публично, а что нет.
 */
function toPublicCard(publication: {
  slug?: string;
  denormalizedFields: Record<string, unknown>;
  seo?: { title: string; description: string; canonicalUrl: string; structuredData: Record<string, unknown> };
}) {
  return {
    slug: publication.slug,
    ...publication.denormalizedFields,
    seo: publication.seo,
  };
}

function parseBbox(raw: string): { minLng: number; minLat: number; maxLng: number; maxLat: number } | undefined {
  const parts = raw.split(',').map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) {
    return undefined;
  }
  const [minLng, minLat, maxLng, maxLat] = parts as [number, number, number, number];
  return { minLng, minLat, maxLng, maxLat };
}
