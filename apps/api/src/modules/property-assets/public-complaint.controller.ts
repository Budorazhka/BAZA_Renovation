import { Body, Controller, HttpCode, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
import { MarketplacePublicationRepository } from '@baza/publication';
import { ComplaintService } from './complaint.service';
import { SubmitComplaintDto } from './dto/submit-complaint.dto';
import { IpRateLimitGuard } from '../../shared/rate-limit/ip-rate-limit.guard';
import { RateLimit } from '../../shared/rate-limit/rate-limit.decorator';

/**
 * ADMIN-OPS-001: публичная, анонимная (без TenantGuard/PermissionGuard —
 * тот же принцип, что CrmController.revealContact/PublicListingsController)
 * подача жалобы на конкретный опубликованный listing. Адресуется по
 * публичному `slug` (не внутреннему id) — API-конвенция master plan разд.7.1
 * ("Публичные URL используют slug, внутренние связи — неизменяемый id"),
 * тот же выбор, что PublicListingsController.getPublicListing.
 *
 * Rate-limit: переиспользует уже существующий generic IpRateLimitGuard +
 * @RateLimit (shared/rate-limit) — тот же механизм, что auth login/register,
 * не отдельная новая инфраструктура.
 */
@Controller('public/listings')
export class PublicComplaintController {
  constructor(
    private readonly complaintService: ComplaintService,
    private readonly publicationRepository: MarketplacePublicationRepository,
  ) {}

  @Post(':slug/complaints')
  @HttpCode(201)
  @UseGuards(IpRateLimitGuard)
  @RateLimit({ keyPrefix: 'complaint-submit', limit: 5, windowSeconds: 60 })
  async submit(@Param('slug') slug: string, @Body() dto: SubmitComplaintDto) {
    const publication = await this.publicationRepository.findBySlug(slug);
    // status !== 'published' (найдено 03.09.2026 внешним ревью): без этой
    // проверки жалобу можно было подать на черновик/снятый с публикации
    // объект — сущность, на которую посетитель сайта физически не мог
    // смотреть, а значит не мог и пожаловаться на неё легитимно.
    if (!publication || publication.sourceType !== 'listing' || publication.status !== 'published') {
      throw new NotFoundException('Publication not found');
    }

    const result = await this.complaintService.submit({
      listingId: publication.sourceId,
      category: dto.category,
      details: dto.details,
      reporterName: dto.reporterName,
      reporterPhone: dto.reporterPhone,
      reporterEmail: dto.reporterEmail,
    });

    return { id: result.id.toString(), status: 'pending' };
  }
}
