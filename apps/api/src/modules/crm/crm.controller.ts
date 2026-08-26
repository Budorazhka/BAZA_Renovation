import { Body, Controller, HttpCode, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { FastifyRequest } from 'fastify';
import { CrmService } from './crm.service';
import { RevealContactDto } from './dto/reveal-contact.dto';

/**
 * D-05/OpenAPI v1-first-vertical-slice.yaml: публичный (гостевой, БЕЗ
 * TenantGuard/PermissionGuard — тот же принцип, что PublicController)
 * reveal-contact endpoint. master plan явно требует "отдельная rate-
 * limited команда" — @UseGuards(ThrottlerGuard) применён точечно здесь,
 * не глобально на все контроллеры (ThrottlerModule.forRoot в app.module.ts
 * регистрирует конфигурацию лимитов, но не применяет guard сам по себе).
 */
@Controller('public/developments')
@UseGuards(ThrottlerGuard)
export class CrmController {
  constructor(private readonly crmService: CrmService) {}

  @Post(':slug/reveal-contact')
  @HttpCode(200)
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  async revealContact(
    @Req() req: FastifyRequest,
    @Param('slug') slug: string,
    @Body() dto: RevealContactDto,
  ) {
    const result = await this.crmService.revealContact({
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
