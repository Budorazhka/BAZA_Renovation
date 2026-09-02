import { Body, Controller, Get, Headers, HttpCode, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AppException } from '../../shared/errors/app-exception';
import { ErrorCode } from '../../shared/errors/error-codes';
import type { FastifyRequest } from 'fastify';
import { Types } from 'mongoose';
import { AdminGuard } from '../../shared/admin/admin.guard';
import { requireAdminContext } from '../../shared/admin/admin-context.middleware';
import { AdminAccountService } from './admin-account.service';
import { CreateAdminAccountDto } from './dto/create-admin-account.dto';
import { CreatePermissionGrantDto } from './dto/create-permission-grant.dto';
import { ListAdminAccountsQueryDto } from './dto/list-admin-accounts-query.dto';
import { DeactivateAdminAccountDto } from './dto/deactivate-admin-account.dto';
import { ReactivateAdminAccountDto } from './dto/reactivate-admin-account.dto';
import { RevokePermissionGrantDto } from './dto/revoke-permission-grant.dto';

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

  /**
   * admin-web accounts screen: без этого endpoint'а render нечего —
   * AdminAccountRepository.list() существовал только на уровне репозитория
   * до этого прохода. super_admin-only enforced внутри сервиса, тот же
   * принцип, что create/grant выше.
   */
  @Get()
  async list(@Req() req: FastifyRequest, @Query() dto: ListAdminAccountsQueryDto) {
    const adminContext = requireAdminContext(req);
    const rows = await this.adminAccountService.listAdminAccounts(adminContext, {
      cursor: dto.cursor ? new Types.ObjectId(dto.cursor) : undefined,
      limit: dto.limit,
    });
    const hasMore = rows.length > dto.limit;
    const pageRows = hasMore ? rows.slice(0, dto.limit) : rows;
    const nextCursor = hasMore ? pageRows[pageRows.length - 1]!.id.toString() : null;
    return {
      items: pageRows.map((row) => ({
        id: row.id.toString(),
        identityId: row.identityId.toString(),
        isSuperAdmin: row.isSuperAdmin,
        status: row.status,
        createdAt: row.createdAt.toISOString(),
      })),
      nextCursor,
    };
  }

  @Post()
  async create(
    @Req() req: FastifyRequest,
    @Body() dto: CreateAdminAccountDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const adminContext = requireAdminContext(req);
    if (!idempotencyKey) {
      throw new AppException(ErrorCode.IDEMPOTENCY_KEY_REQUIRED, 'Idempotency-Key header is required');
    }

    const actorIdentityId = new Types.ObjectId(adminContext.identityId);
    const requestBody = { identityId: dto.identityId, isSuperAdmin: dto.isSuperAdmin ?? false };

    const replay = await this.adminAccountService.checkCreateReplay(actorIdentityId, idempotencyKey, requestBody);
    if (replay) {
      return replay.responseBody;
    }

    const account = await this.adminAccountService.createAdminAccount(adminContext, {
      identityId: new Types.ObjectId(dto.identityId),
      isSuperAdmin: dto.isSuperAdmin ?? false,
      correlationId: req.correlationId,
      idempotency: { actorIdentityId, key: idempotencyKey, requestBody },
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

  /**
   * admin-web accounts screen: просмотр текущих grants аккаунта перед
   * выдачей нового — без этого super_admin не видит, что уже выдано, и
   * рискует дублировать grant вслепую. Включает уже отозванные grants
   * (см. AdminAccountService.listGrants) — UI показывает полную историю.
   */
  @Get(':adminAccountId/grants')
  async listGrants(@Req() req: FastifyRequest, @Param('adminAccountId') adminAccountIdParam: string) {
    const adminContext = requireAdminContext(req);
    const grants = await this.adminAccountService.listGrants(adminContext, new Types.ObjectId(adminAccountIdParam));
    return { items: grants };
  }

  /**
   * Именование по существующему паттерну модуля: singular-verb-suffix,
   * тот же стиль, что POST /admin/publications/:id/unpublish, не PATCH
   * (нет ни одного PATCH-прецедента в этом модуле). reason обязателен
   * (DeactivateAdminAccountDto, min 10 символов) — тот же порог, что
   * unpublish. super_admin-only и self-deactivation/last-super-admin
   * инварианты — целиком внутри AdminAccountService, не здесь (тот же
   * принцип, что уже документирован в самом сервисе).
   */
  @Post(':adminAccountId/deactivate')
  @HttpCode(200)
  async deactivate(
    @Req() req: FastifyRequest,
    @Param('adminAccountId') adminAccountIdParam: string,
    @Body() dto: DeactivateAdminAccountDto,
  ): Promise<{ status: 'active' | 'deactivated' }> {
    const adminContext = requireAdminContext(req);
    return this.adminAccountService.deactivateAdminAccount(adminContext, {
      adminAccountId: new Types.ObjectId(adminAccountIdParam),
      reason: dto.reason,
      correlationId: req.correlationId,
    });
  }

  @Post(':adminAccountId/reactivate')
  @HttpCode(200)
  async reactivate(
    @Req() req: FastifyRequest,
    @Param('adminAccountId') adminAccountIdParam: string,
    @Body() dto: ReactivateAdminAccountDto,
  ): Promise<{ status: 'active' | 'deactivated' }> {
    const adminContext = requireAdminContext(req);
    return this.adminAccountService.reactivateAdminAccount(adminContext, {
      adminAccountId: new Types.ObjectId(adminAccountIdParam),
      reason: dto.reason,
      correlationId: req.correlationId,
    });
  }

  /**
   * Append-only revoke (не DELETE — ничего физически не удаляется, см.
   * PermissionGrantDocument.revokedAt). expectedVersion — CAS, конфликт
   * возвращается как 409 VERSION_CONFLICT (см. AdminAccountService.revokeGrant).
   */
  @Post(':adminAccountId/grants/:grantId/revoke')
  @HttpCode(200)
  async revokeGrant(
    @Req() req: FastifyRequest,
    @Param('adminAccountId') adminAccountIdParam: string,
    @Param('grantId') grantIdParam: string,
    @Body() dto: RevokePermissionGrantDto,
  ): Promise<{ revoked: true }> {
    const adminContext = requireAdminContext(req);
    await this.adminAccountService.revokeGrant(adminContext, {
      adminAccountId: new Types.ObjectId(adminAccountIdParam),
      grantId: new Types.ObjectId(grantIdParam),
      expectedVersion: dto.expectedVersion,
      reason: dto.reason,
      correlationId: req.correlationId,
    });
    return { revoked: true };
  }
}
