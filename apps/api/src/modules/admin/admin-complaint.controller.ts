import { Body, Controller, Get, HttpCode, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { Types } from 'mongoose';
import { AdminGuard } from '../../shared/admin/admin.guard';
import { requireAdminContext } from '../../shared/admin/admin-context.middleware';
import { AdminComplaintService } from './admin-complaint.service';
import { ListComplaintsQueryDto } from './dto/list-complaints-query.dto';
import { ResolveComplaintRequestDto } from './dto/resolve-complaint-request.dto';

/**
 * ADMIN-OPS-001. AdminGuard — только аутентификация Admin-актора (тот же
 * принцип, что AdminDuplicateCandidateController), permission-проверка
 * (`complaint.resolve.city(X)`) выполняется внутри AdminComplaintService.
 */
@Controller('admin/complaints')
@UseGuards(AdminGuard)
export class AdminComplaintController {
  constructor(private readonly service: AdminComplaintService) {}

  @Get()
  async list(@Req() req: FastifyRequest, @Query() dto: ListComplaintsQueryDto) {
    const adminContext = requireAdminContext(req);
    return this.service.list(adminContext, dto);
  }

  @Post(':complaintId/resolve')
  @HttpCode(200)
  async resolve(
    @Req() req: FastifyRequest,
    @Param('complaintId') complaintIdParam: string,
    @Body() dto: ResolveComplaintRequestDto,
  ) {
    const adminContext = requireAdminContext(req);

    await this.service.resolve(adminContext, {
      complaintId: new Types.ObjectId(complaintIdParam),
      decision: dto.decision,
      reason: dto.reason,
      correlationId: req.correlationId,
    });

    return { id: complaintIdParam, status: dto.decision === 'upheld' ? 'resolved_upheld' : 'resolved_dismissed' };
  }
}
