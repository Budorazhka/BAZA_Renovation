import { Body, Controller, HttpCode, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { Types } from 'mongoose';
import { AdminGuard } from '../../shared/admin/admin.guard';
import { requireAdminContext } from '../../shared/admin/admin-context.middleware';
import { AdminAccountService } from './admin-account.service';
import { CreateAdminAccountDto } from './dto/create-admin-account.dto';
import { CreatePermissionGrantDto } from './dto/create-permission-grant.dto';

/**
 * НЕ в узкой OpenAPI-спеке (v1-first-vertical-slice.yaml специфицирует
 * только adminUnpublish) — тот же паттерн расширения, что unit.price.update
 * в D-01: без этих endpoint'ов ни один AdminAccount не может появиться в
 * системе никаким HTTP-путём (AdminAccountService.createAdminAccount/
 * grantPermission написаны и протестированы в D-06, но не были подключены
 * к HTTP до этого прохода — честный пробел, зафиксированный в
 * d06-admin-operation.md "Не реализовано").
 *
 * AdminGuard — только аутентификация (наличие AdminContext). Self-escalation
 * prevention (isSuperAdmin проверка) — ВНУТРИ AdminAccountService, не здесь
 * — тот же принцип, что уже задокументирован в самом сервисе: пропущенный
 * guard на будущем эндпоинте не должен становиться дырой эскалации.
 */
@Controller('admin/accounts')
@UseGuards(AdminGuard)
export class AdminAccountController {
  constructor(private readonly adminAccountService: AdminAccountService) {}

  @Post()
  async create(@Req() req: FastifyRequest, @Body() dto: CreateAdminAccountDto) {
    const adminContext = requireAdminContext(req);
    const account = await this.adminAccountService.createAdminAccount(adminContext, {
      identityId: new Types.ObjectId(dto.identityId),
      isSuperAdmin: dto.isSuperAdmin ?? false,
      correlationId: req.correlationId,
    });
    return { id: account._id.toString(), identityId: account.identityId.toString(), isSuperAdmin: account.isSuperAdmin };
  }

  @Post(':adminAccountId/grants')
  @HttpCode(200)
  async grant(
    @Req() req: FastifyRequest,
    @Param('adminAccountId') adminAccountIdParam: string,
    @Body() dto: CreatePermissionGrantDto,
  ): Promise<{ granted: true }> {
    const adminContext = requireAdminContext(req);
    await this.adminAccountService.grantPermission(adminContext, {
      adminAccountId: new Types.ObjectId(adminAccountIdParam),
      resource: dto.resource,
      action: dto.action,
      scope: dto.scope,
      scopeValue: dto.scopeValue,
      correlationId: req.correlationId,
    });
    return { granted: true };
  }
}
