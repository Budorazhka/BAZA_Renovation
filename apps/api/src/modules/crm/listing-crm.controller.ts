import { Body, Controller, HttpCode, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { FastifyRequest } from 'fastify';
import { CrmService } from './crm.service';
import { RevealContactDto } from './dto/reveal-contact.dto';

/**
 * MKT-002 / LEAD-001: публичный (гостевой, БЕЗ TenantGuard/PermissionGuard)
 * reveal-contact endpoint для вторички и аренды. Тот же паттерн rate-limiting,
 * что CrmController для developments: @UseGuards(ThrottlerGuard) и @Throttle.
 */
@Controller('public/listings')
@UseGuards(ThrottlerGuard)
export class ListingCrmController {
  constructor(private readonly crmService: CrmService) {}

  @Post(':slug/reveal-contact')
  @HttpCode(200)
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  async revealContact(
    @Req() req: FastifyRequest,
    @Param('slug') slug: string,
    @Body() dto: RevealContactDto,
  ) {
    const result = await this.crmService.revealListingContact({
      slug,
      requesterName: dto.requesterName,
      requesterPhone: dto.requesterPhone,
      utm: dto.utm,
      referrer: req.headers.referer,
      correlationId: req.correlationId,
    });

    return {
      phone: result.phone,
      whatsapp: result.whatsapp,
      telegram: result.telegram,
      leadId: result.leadId.toString(),
    };
  }
}
