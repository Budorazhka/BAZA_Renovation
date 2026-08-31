import { Body, Controller, Get, HttpCode, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { Types } from 'mongoose';
import { AdminGuard } from '../../shared/admin/admin.guard';
import { requireAdminContext } from '../../shared/admin/admin-context.middleware';
import { AdminDuplicateCandidateService } from './admin-duplicate-candidate.service';
import { ListDuplicateCandidatesQueryDto } from './dto/list-duplicate-candidates-query.dto';
import { ConfirmDuplicateRequestDto } from './dto/confirm-duplicate-request.dto';

/**
 * OpenAPI v1-first-vertical-slice.yaml `adminListDuplicateCandidates`/
 * `adminConfirmDuplicate`. AdminGuard — только аутентификация Admin-актора
 * (тот же принцип, что AdminPublicationController), permission-проверка
 * выполняется внутри AdminDuplicateCandidateService.
 */
@Controller('admin/duplicate-candidates')
@UseGuards(AdminGuard)
export class AdminDuplicateCandidateController {
  constructor(private readonly service: AdminDuplicateCandidateService) {}

  @Get()
  async list(@Req() req: FastifyRequest, @Query() dto: ListDuplicateCandidatesQueryDto) {
    const adminContext = requireAdminContext(req);
    return this.service.list(adminContext, dto);
  }

  @Post(':duplicateCandidateId/confirm')
  @HttpCode(200)
  async confirm(
    @Req() req: FastifyRequest,
    @Param('duplicateCandidateId') duplicateCandidateIdParam: string,
    @Body() dto: ConfirmDuplicateRequestDto,
  ) {
    const adminContext = requireAdminContext(req);

    await this.service.confirm(adminContext, {
      duplicateCandidateId: new Types.ObjectId(duplicateCandidateIdParam),
      reason: dto.reason,
      correlationId: req.correlationId,
    });

    return { id: duplicateCandidateIdParam, status: 'confirmed_duplicate' };
  }
}
