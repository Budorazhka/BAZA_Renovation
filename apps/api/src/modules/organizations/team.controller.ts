import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { Types } from 'mongoose';
import { TenantGuard } from '../../shared/tenant/tenant.guard';
import { requireTenantContext } from '../../shared/tenant/tenant-context.middleware';
import { PermissionGuard } from '../authorization/permission.guard';
import { RequirePermission } from '../authorization/require-permission.decorator';
import { OrganizationsService } from './organizations.service';
import { TeamService, type TeamUserView } from './team.service';
import { VacatePositionDto } from './dto/vacate-position.dto';
import { MovePositionDto } from './dto/move-position.dto';
import { SetPositionStatusDto } from './dto/set-position-status.dto';
import { AssignOccupantDto } from './dto/assign-occupant.dto';
import { SetPositionAvatarDto } from './dto/set-position-avatar.dto';
import { CreateTeamUserDto } from './dto/create-team-user.dto';
import { CreateTeamAccountSlotDto } from './dto/create-team-account-slot.dto';
import { UpdateTeamUserProfileDto } from './dto/update-team-user-profile.dto';

interface ApiResponse<T> {
  success: boolean;
  data: T;
}

/**
 * ERP-фронтенд (apps/erp-web/src/services/teamApi.ts) ожидает конкретно
 * {success, data} обёртку на каждом ответе — не plain-объект, как остальные
 * controller'ы этой кодовой базы. Buквальное требование уже написанного
 * клиентского кода (не архитектурное предпочтение этого прохода) — проще
 * выполнить здесь, чем менять уже переписанный teamApi.ts.
 *
 * PermissionGuard навешан точечно на методах (не на класс — TenantGuard на
 * классе достаточен для ensure-self, тот метод не раскрывает чужие данные).
 * `list`/`ensure-team` возвращают полный TeamUserView всех позиций
 * организации, включая HR-PII (loginEmail/phone/birthDate/telegram/...) —
 * security review 31.08.2026: раньше эти два метода были БЕЗ
 * PermissionGuard вообще (только TenantGuard), то есть отдавали эти поля
 * любой authenticated сессии организации без explicit grant'а — deny-by-
 * default нарушался именно здесь. Требуют `position.read` (см.
 * default-role-grants.ts — добавлен всем ролям тем же коммитом, что и этот
 * guard, иначе никто не смог бы увидеть список команды вообще). Все
 * write-операции teamApi.ts реализованы на backend (26.08.2026) — HR-
 * профильные поля идут через отдельную коллекцию position_profiles (см.
 * TeamService комментарий), не расширяют специфицированную domain-модель.
 */
@Controller('team-users')
@UseGuards(TenantGuard)
export class TeamController {
  constructor(
    private readonly teamService: TeamService,
    private readonly organizationsService: OrganizationsService,
  ) {}

  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermission('position', 'read')
  async list(@Req() req: FastifyRequest): Promise<ApiResponse<TeamUserView[]>> {
    const tenantContext = requireTenantContext(req);
    const data = await this.teamService.listForOrganization(new Types.ObjectId(tenantContext.organizationId));
    return { success: true, data };
  }

  /**
   * teamApi.ts::getById(id) — GET /team-users/:positionId, одна позиция.
   * Тот же position.read grant, что list() — оба отдают HR-PII, только
   * list() всех позиций сразу, этот метод одну по id. TeamService.getById
   * scoped по organizationId из TenantContext (не из URL) тем же
   * findByIdForOrganization-паттерном, что assignOccupant — единый
   * NOT_FOUND для "не существует" и "чужая организация".
   */
  @Get(':positionId')
  @UseGuards(PermissionGuard)
  @RequirePermission('position', 'read')
  async getById(
    @Req() req: FastifyRequest,
    @Param('positionId') positionIdParam: string,
  ): Promise<ApiResponse<TeamUserView>> {
    const tenantContext = requireTenantContext(req);
    const data = await this.teamService.getById(
      new Types.ObjectId(positionIdParam),
      new Types.ObjectId(tenantContext.organizationId),
    );
    return { success: true, data };
  }

  /**
   * teamApi.ts::create(payload) — второй, отдельный от assignOccupant-
   * invite-flow путь: руководитель сам задаёт пароль новому сотруднику
   * (не invite-token/activate-ссылка). Composite-команда, см. TeamService.
   * createOccupiedPosition комментарий. Тот же grant, что assignOccupant —
   * position.create.organization (permission-matrix.md 1.4, эта команда
   * создаёт позицию, не только назначает occupant'а на уже существующую).
   */
  @Post()
  @HttpCode(201)
  @UseGuards(PermissionGuard)
  @RequirePermission('position', 'create')
  async create(
    @Req() req: FastifyRequest,
    @Body() dto: CreateTeamUserDto,
  ): Promise<ApiResponse<TeamUserView>> {
    const tenantContext = requireTenantContext(req);

    const data = await this.teamService.createOccupiedPosition({
      organizationId: new Types.ObjectId(tenantContext.organizationId),
      actorIdentityId: new Types.ObjectId(tenantContext.identityId),
      correlationId: req.correlationId,
      fixedRole: dto.role,
      managerId: dto.managerId ? new Types.ObjectId(dto.managerId) : null,
      loginEmail: dto.loginEmail,
      password: dto.password,
      occupantDisplayName: dto.name,
      profile: {
        phone: dto.phone,
        hireDate: dto.hireDate,
        birthDate: dto.birthDate,
        department: dto.department,
        city: dto.city,
        telegram: dto.telegram,
        aboutMe: dto.aboutMe,
        aboutCompany: dto.aboutCompany,
        skills: dto.skills,
        whatsapp: dto.whatsapp,
        vk: dto.vk,
        instagram: dto.instagram,
        website: dto.website,
      },
    });
    return { success: true, data };
  }

  /**
   * teamApi.ts::createAccountSlot(payload) — «Добавить слот менеджера»:
   * вакантная позиция БЕЗ occupant'а (POST /team-users/positions), в
   * отличие от create() выше не требует loginEmail/password. Тот же
   * position.create grant — это тоже создание позиции, только пустой.
   * position/accessProfile из payload не сохраняются, см.
   * CreateTeamAccountSlotDto/TeamService.createVacantSlot комментарии.
   */
  @Post('positions')
  @HttpCode(201)
  @UseGuards(PermissionGuard)
  @RequirePermission('position', 'create')
  async createSlot(
    @Req() req: FastifyRequest,
    @Body() dto: CreateTeamAccountSlotDto,
  ): Promise<ApiResponse<TeamUserView>> {
    const tenantContext = requireTenantContext(req);
    const data = await this.teamService.createVacantSlot({
      organizationId: new Types.ObjectId(tenantContext.organizationId),
      fixedRole: dto.role,
      managerId: dto.managerId ? new Types.ObjectId(dto.managerId) : null,
    });
    return { success: true, data };
  }

  /**
   * teamApi.ts::update(id, payload) — ТОЛЬКО HR-профильные поля (см.
   * TeamService.updateProfile комментарий). position.vacate — тот же grant,
   * что move/status ниже переиспользуют для "управление позицией/её
   * occupant'ом", не отдельная строка в permission-matrix.md.
   */
  @Patch('positions/:positionId')
  @UseGuards(PermissionGuard)
  @RequirePermission('position', 'vacate')
  async update(
    @Req() req: FastifyRequest,
    @Param('positionId') positionIdParam: string,
    @Body() dto: UpdateTeamUserProfileDto,
  ): Promise<ApiResponse<TeamUserView>> {
    const tenantContext = requireTenantContext(req);
    const data = await this.teamService.updateProfile(
      new Types.ObjectId(positionIdParam),
      new Types.ObjectId(tenantContext.organizationId),
      dto,
    );
    return { success: true, data };
  }

  @Post('ensure-self')
  async ensureSelf(@Req() req: FastifyRequest): Promise<ApiResponse<TeamUserView | null>> {
    const tenantContext = requireTenantContext(req);
    const data = await this.teamService.ensureSelf(
      new Types.ObjectId(tenantContext.organizationId),
      new Types.ObjectId(tenantContext.positionId),
    );
    return { success: true, data };
  }

  /**
   * teamApi.ensureTeam(): "Автосоздание команды владельца... на бэке гейт
   * по isOwner из JWT — для не-владельцев вернётся null, ничего не
   * создаётся". У этого backend'а автосоздание команды уже выполняется
   * атомарно в OrganizationsService.createOrganizationWithOwner (D-05/D-06
   * сессии — organization+owner-position+assignment+ProductAccess одной
   * командой) — к моменту первого логина организация УЖЕ существует,
   * отдельного "ensure" шага после логина не требуется. Endpoint
   * реализован как idempotent no-op (возвращает уже существующие
   * organizationId/positions текущего TenantContext), не создаёт ничего
   * нового — семантически совместим с "не владелец → null" контрактом
   * фронтенда (гость без TenantContext получит 403 от TenantGuard раньше,
   * не дойдёт сюда).
   */
  @Post('ensure-team')
  @UseGuards(PermissionGuard)
  @RequirePermission('position', 'read')
  async ensureTeam(
    @Req() req: FastifyRequest,
  ): Promise<ApiResponse<{ teamId: string; positions: TeamUserView[] } | null>> {
    const tenantContext = requireTenantContext(req);
    const positions = await this.teamService.listForOrganization(new Types.ObjectId(tenantContext.organizationId));
    return { success: true, data: { teamId: tenantContext.organizationId, positions } };
  }

  /**
   * teamApi.ts::vacate(positionId) — /team-users/positions/:id/vacate,
   * permission-matrix.md 1.4 position.vacate.organization. Делегирует
   * OrganizationsService.vacatePositionByPositionId (уже написан и
   * протестирован для organizations-controller-стороны) — не дублирует
   * транзакционную логику.
   */
  @Post('positions/:positionId/vacate')
  @UseGuards(PermissionGuard)
  @RequirePermission('position', 'vacate')
  async vacate(
    @Req() req: FastifyRequest,
    @Param('positionId') positionIdParam: string,
    @Body() dto: VacatePositionDto,
  ): Promise<ApiResponse<TeamUserView | null>> {
    const tenantContext = requireTenantContext(req);
    const positionId = new Types.ObjectId(positionIdParam);

    await this.organizationsService.vacatePositionByPositionId({
      positionId,
      expectedOrganizationId: new Types.ObjectId(tenantContext.organizationId),
      actorIdentityId: new Types.ObjectId(tenantContext.identityId),
      correlationId: req.correlationId,
      handoverNote: dto.handoverNote,
    });

    const data = await this.teamService.ensureSelf(new Types.ObjectId(tenantContext.organizationId), positionId);
    return { success: true, data };
  }

  /**
   * teamApi.ts::assignOccupant(positionId, {name, email, loginEmail, phone?,
   * telegram?}) — email-based invite-flow (D-05/team-users honest gap,
   * закрыто 26.08.2026). permission-matrix.md 1.4 position.assign_occupant.
   * organization — тот же grant, что OrganizationsController.assignOccupant
   * (identityId-путь), не дублируется отдельной строкой в матрице: это два
   * входа в одну и ту же команду, не два разных действия.
   */
  @Post('positions/:positionId/assign')
  @HttpCode(200)
  @UseGuards(PermissionGuard)
  @RequirePermission('position', 'assign_occupant')
  async assign(
    @Req() req: FastifyRequest,
    @Param('positionId') positionIdParam: string,
    @Body() dto: AssignOccupantDto,
  ): Promise<ApiResponse<{ user: TeamUserView | null; linkedExisting: boolean; inviteToken: string | null; inviteTokenExpiresAt: string | null }>> {
    const tenantContext = requireTenantContext(req);
    const positionId = new Types.ObjectId(positionIdParam);

    const result = await this.organizationsService.assignOccupantByEmail({
      positionId,
      name: dto.name,
      email: dto.email,
      loginEmail: dto.loginEmail,
      actorIdentityId: new Types.ObjectId(tenantContext.identityId),
      expectedOrganizationId: new Types.ObjectId(tenantContext.organizationId),
      correlationId: req.correlationId,
    });

    const user = await this.teamService.ensureSelf(new Types.ObjectId(tenantContext.organizationId), positionId);
    return {
      success: true,
      data: {
        user,
        linkedExisting: result.linkedExisting,
        inviteToken: result.inviteToken,
        inviteTokenExpiresAt: result.inviteTokenExpiresAt ? result.inviteTokenExpiresAt.toISOString() : null,
      },
    };
  }

  /**
   * teamApi.ts::move(id, managerId) — /team-users/positions/:id/move.
   */
  @Patch('positions/:positionId/move')
  @UseGuards(PermissionGuard)
  @RequirePermission('position', 'vacate')
  async move(
    @Req() req: FastifyRequest,
    @Param('positionId') positionIdParam: string,
    @Body() dto: MovePositionDto,
  ): Promise<ApiResponse<TeamUserView | null>> {
    const tenantContext = requireTenantContext(req);
    const positionId = new Types.ObjectId(positionIdParam);

    await this.organizationsService.changePositionParent({
      positionId,
      newParentPositionId: dto.managerId ? new Types.ObjectId(dto.managerId) : null,
      expectedOrganizationId: new Types.ObjectId(tenantContext.organizationId),
    });

    const data = await this.teamService.ensureSelf(new Types.ObjectId(tenantContext.organizationId), positionId);
    return { success: true, data };
  }

  /**
   * teamApi.ts::setStatus(id, status) — /team-users/positions/:id/status.
   * Не в permission-matrix.md явной строкой — переиспользует
   * position.vacate.organization grant (тот же круг прав, что vacate/move,
   * управление позицией/её occupant'ом).
   */
  @Patch('positions/:positionId/status')
  @UseGuards(PermissionGuard)
  @RequirePermission('position', 'vacate')
  async setStatus(
    @Req() req: FastifyRequest,
    @Param('positionId') positionIdParam: string,
    @Body() dto: SetPositionStatusDto,
  ): Promise<ApiResponse<TeamUserView>> {
    const tenantContext = requireTenantContext(req);
    const data = await this.teamService.setPositionOccupantStatus(
      new Types.ObjectId(positionIdParam),
      new Types.ObjectId(tenantContext.organizationId),
      dto.status,
    );
    return { success: true, data };
  }

  /**
   * teamApi.ts::remove(id) — /team-users/positions/:id, DELETE. Возвращает
   * void в TeamUser-контракте фронтенда (Promise<void>, не ApiResponse<T>) —
   * тело ответа не важно клиенту, но {success:true} для консистентности с
   * остальными endpoint'ами этого контроллера, не пустой 204.
   */
  @Delete('positions/:positionId')
  @HttpCode(200)
  @UseGuards(PermissionGuard)
  @RequirePermission('position', 'vacate')
  async remove(
    @Req() req: FastifyRequest,
    @Param('positionId') positionIdParam: string,
  ): Promise<ApiResponse<null>> {
    const tenantContext = requireTenantContext(req);
    await this.organizationsService.closePosition({
      positionId: new Types.ObjectId(positionIdParam),
      expectedOrganizationId: new Types.ObjectId(tenantContext.organizationId),
    });
    return { success: true, data: null };
  }

  /**
   * teamApi.ts::uploadAvatar (26.08.2026, honest gap закрыт) —
   * /team-users/positions/:id/avatar. НЕ multipart/form-data upload —
   * клиент проходит стандартный intent-flow MediaModule (POST /media/
   * upload-intent → PUT presigned URL → POST /media/:assetId/confirm)
   * заранее, сюда передаётся только уже подтверждённый assetId. Тот же
   * протокол, что весь остальной upload в проекте (ADR-008), не отдельный
   * server-proxied multipart-путь.
   */
  @Patch('positions/:positionId/avatar')
  @UseGuards(PermissionGuard)
  @RequirePermission('position', 'vacate')
  async setAvatar(
    @Req() req: FastifyRequest,
    @Param('positionId') positionIdParam: string,
    @Body() dto: SetPositionAvatarDto,
  ): Promise<ApiResponse<TeamUserView>> {
    const tenantContext = requireTenantContext(req);
    const data = await this.teamService.setPositionAvatar(
      new Types.ObjectId(positionIdParam),
      new Types.ObjectId(tenantContext.organizationId),
      new Types.ObjectId(dto.assetId),
    );
    return { success: true, data };
  }
}
