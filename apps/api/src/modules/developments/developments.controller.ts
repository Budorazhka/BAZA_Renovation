import { Body, Controller, Get, Headers, HttpCode, Param, Patch, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import type { FastifyRequest } from 'fastify';
import { Types } from 'mongoose';
import { TenantGuard } from '../../shared/tenant/tenant.guard';
import { requireTenantContext } from '../../shared/tenant/tenant-context.middleware';
import { PermissionGuard } from '../authorization/permission.guard';
import { RequirePermission } from '../authorization/require-permission.decorator';
import { AppException } from '../../shared/errors/app-exception';
import { ErrorCode } from '../../shared/errors/error-codes';
import { DevelopmentsService } from './developments.service';
import { IdempotencyService } from '../../shared/idempotency/idempotency.service';
import { CreateDevelopmentDto } from './dto/create-development.dto';
import { UpdateDevelopmentDto } from './dto/update-development.dto';
import { CreateBuildingDto } from './dto/create-building.dto';
import { CreateSectionDto } from './dto/create-section.dto';
import { CreateFloorDto } from './dto/create-floor.dto';
import { CreateFloorPlanDto } from './dto/create-floor-plan.dto';
import { CreateUnitDto } from './dto/create-unit.dto';
import { UpdateUnitPriceDto } from './dto/update-unit-price.dto';
import { UpdateUnitStatusDto } from './dto/update-unit-status.dto';

const DEFAULT_LIST_LIMIT = 20;
const MAX_LIST_LIMIT = 100;

/**
 * D-01: Development aggregate — Development/Building/Section/Floor/Unit/
 * FloorPlan CRUD (docs/api/v1-first-vertical-slice.yaml специфицирует
 * только Development/Building/Floor/Unit create-пути для vertical slice
 * до publish, D-03 — update/price/status команды здесь добавлены как
 * прямое следствие domain-model.md commands list и permission-matrix.md
 * `unit.price.update.project`/`unit.status.update.project`, отсутствуют
 * в узкой OpenAPI-спеке v1-first-vertical-slice.yaml — тот же паттерн
 * явного расхождения, что уже применялся для media_asset.upload).
 *
 * permission-matrix.md 1.2: `development.read.organization`,
 * `development.edit.organization` (Building/Floor/FloorPlan создание —
 * часть "редактирования" ЖК-агрегата, отдельных прав на под-уровни матрица
 * не предусматривает), `unit.price.update.project`/`unit.status.update.project`
 * (scope `project` на MVP не проверяется отдельно от `organization` —
 * permission-matrix.md явно отмечает: "ни одна строка ERP-матрицы... не
 * пользуется project-scope на MVP-уровне").
 */
@Controller()
@UseGuards(TenantGuard, PermissionGuard)
export class DevelopmentsController {
  constructor(
    private readonly developmentsService: DevelopmentsService,
    private readonly idempotencyService: IdempotencyService,
  ) {}

  @Post('developments')
  @HttpCode(201)
  @RequirePermission('development', 'edit')
  async createDevelopment(@Req() req: FastifyRequest, @Body() dto: CreateDevelopmentDto) {
    const tenantContext = requireTenantContext(req);

    return this.developmentsService.createDevelopment({
      organizationId: new Types.ObjectId(tenantContext.organizationId),
      name: dto.name,
      location: {
        country: dto.location.country,
        city: dto.location.city,
        address: dto.location.address,
        geo: dto.location.geo,
      },
      contact: {
        phone: dto.contact.phone,
        whatsapp: dto.contact.whatsapp,
        telegram: dto.contact.telegram,
      },
      classType: dto.classType,
      startDate: dto.startDate ? new Date(dto.startDate) : undefined,
      completionDate: dto.completionDate ? new Date(dto.completionDate) : undefined,
      description: dto.description,
    });
  }

  @Get('developments')
  @RequirePermission('development', 'read')
  async listDevelopments(
    @Req() req: FastifyRequest,
    @Query('cursor') cursor?: string,
    @Query('limit') limitParam?: string,
  ) {
    const tenantContext = requireTenantContext(req);
    const limit = Math.min(limitParam ? Number(limitParam) : DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT);

    const items = await this.developmentsService.listDevelopmentsForOrganization(
      new Types.ObjectId(tenantContext.organizationId),
      { cursor: cursor ? new Types.ObjectId(cursor) : undefined, limit },
    );

    const nextCursor = items.length === limit ? items[items.length - 1]!._id.toString() : null;
    return { items, nextCursor };
  }

  @Get('developments/:developmentId')
  @RequirePermission('development', 'read')
  async getDevelopment(@Req() req: FastifyRequest, @Param('developmentId') developmentId: string) {
    const tenantContext = requireTenantContext(req);

    return this.developmentsService.getDevelopmentForOrganization(
      new Types.ObjectId(developmentId),
      new Types.ObjectId(tenantContext.organizationId),
    );
  }

  @Patch('developments/:developmentId')
  @RequirePermission('development', 'edit')
  async updateDevelopment(
    @Req() req: FastifyRequest,
    @Param('developmentId') developmentId: string,
    @Body() dto: UpdateDevelopmentDto,
  ) {
    const tenantContext = requireTenantContext(req);

    await this.developmentsService.updateDevelopment({
      id: new Types.ObjectId(developmentId),
      organizationId: new Types.ObjectId(tenantContext.organizationId),
      expectedVersion: dto.expectedVersion,
      correlationId: req.correlationId,
      changes: {
        name: dto.name,
        location: dto.location,
        contact: dto.contact,
        classType: dto.classType,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        completionDate: dto.completionDate ? new Date(dto.completionDate) : undefined,
        description: dto.description,
      },
    });

    return this.developmentsService.getDevelopmentForOrganization(
      new Types.ObjectId(developmentId),
      new Types.ObjectId(tenantContext.organizationId),
    );
  }

  /**
   * ADR-005/ADR-006: 202 Accepted — publication_pending, worker строит
   * полную проекцию асинхронно (см. v1-first-vertical-slice.yaml).
   * Idempotency-Key header — required (OpenAPI-контракт), механизм
   * idempotency_records реализован (26.08.2026, honest gap закрыт):
   * replay-проверка ДО вызова сервиса — совпадающий (identity, operation,
   * key) с тем же requestHash возвращает сохранённый ответ БЕЗ повторного
   * выполнения publish (не создаёт вторую MarketplacePublication, не
   * инкрементирует version повторно). Несовпадающий hash или отсутствие
   * заголовка — явная ошибка (checkReplay/этот метод бросают AppException
   * до входа в DevelopmentsService).
   */
  @Post('developments/:developmentId/publish')
  @RequirePermission('development', 'edit')
  async publishDevelopment(
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('developmentId') developmentId: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const tenantContext = requireTenantContext(req);

    if (!idempotencyKey) {
      throw new AppException(ErrorCode.IDEMPOTENCY_KEY_REQUIRED, 'Idempotency-Key header is required');
    }

    const actorIdentityId = new Types.ObjectId(tenantContext.identityId);
    const requestBody = { developmentId };

    const replay = await this.idempotencyService.checkReplay({
      identityId: actorIdentityId,
      operation: 'publishDevelopment',
      key: idempotencyKey,
      requestBody,
    });
    if (replay) {
      reply.status(replay.responseStatus);
      return replay.responseBody;
    }

    const result = await this.developmentsService.publishDevelopment({
      id: new Types.ObjectId(developmentId),
      organizationId: new Types.ObjectId(tenantContext.organizationId),
      actorIdentityId,
      idempotencyKey,
      correlationId: req.correlationId,
    });

    // Гонка двух параллельных publish с одним Idempotency-Key (см.
    // DevelopmentsService.publishDevelopment): второй запрос теряет
    // атомарный updateStatus, но сервис сам нашёл record, который только
    // что записал конкурент-победитель — это replay ЭТОЙ попытки, не новая
    // публикация. Возвращаем сохранённый ответ как есть, не 202 с "новым"
    // телом (тот же принцип, что checkReplay ДО транзакции выше).
    if (result.replay) {
      reply.status(result.replay.responseStatus);
      return result.replay.responseBody;
    }

    reply.status(202);
    return {
      id: result.publicationId.toString(),
      sourceType: 'development',
      sourceId: developmentId,
      status: result.status,
    };
  }

  @Post('developments/:developmentId/buildings')
  @HttpCode(201)
  @RequirePermission('development', 'edit')
  async createBuilding(
    @Req() req: FastifyRequest,
    @Param('developmentId') developmentId: string,
    @Body() dto: CreateBuildingDto,
  ) {
    const tenantContext = requireTenantContext(req);

    return this.developmentsService.createBuilding({
      developmentId: new Types.ObjectId(developmentId),
      organizationId: new Types.ObjectId(tenantContext.organizationId),
      name: dto.name,
      floorsCount: dto.floorsCount,
      startDate: dto.startDate ? new Date(dto.startDate) : undefined,
      completionDate: dto.completionDate ? new Date(dto.completionDate) : undefined,
    });
  }

  /**
   * НЕ в узкой OpenAPI-спеке — d01-development-aggregate.md "Не покрыто":
   * repository готов с D-01, HTTP-подключение отсутствовало.
   */
  @Post('buildings/:buildingId/sections')
  @HttpCode(201)
  @RequirePermission('development', 'edit')
  async createSection(
    @Req() req: FastifyRequest,
    @Param('buildingId') buildingId: string,
    @Body() dto: CreateSectionDto,
  ) {
    const tenantContext = requireTenantContext(req);

    return this.developmentsService.createSection({
      buildingId: new Types.ObjectId(buildingId),
      organizationId: new Types.ObjectId(tenantContext.organizationId),
      name: dto.name,
    });
  }

  /**
   * НЕ в узкой OpenAPI-спеке — тот же честный пробел, что createSection выше.
   */
  @Post('buildings/:buildingId/floor-plans')
  @HttpCode(201)
  @RequirePermission('development', 'edit')
  async createFloorPlan(
    @Req() req: FastifyRequest,
    @Param('buildingId') buildingId: string,
    @Body() dto: CreateFloorPlanDto,
  ) {
    const tenantContext = requireTenantContext(req);

    return this.developmentsService.createFloorPlan({
      buildingId: new Types.ObjectId(buildingId),
      organizationId: new Types.ObjectId(tenantContext.organizationId),
      name: dto.name,
      rooms: dto.rooms,
      area: dto.area,
      isEuro: dto.isEuro,
      imageAssetId: dto.imageAssetId ? new Types.ObjectId(dto.imageAssetId) : undefined,
      tags: dto.tags,
    });
  }

  @Post('buildings/:buildingId/floors')
  @HttpCode(201)
  @RequirePermission('development', 'edit')
  async createFloor(
    @Req() req: FastifyRequest,
    @Param('buildingId') buildingId: string,
    @Body() dto: CreateFloorDto,
  ) {
    const tenantContext = requireTenantContext(req);

    return this.developmentsService.createFloor({
      buildingId: new Types.ObjectId(buildingId),
      sectionId: dto.sectionId ? new Types.ObjectId(dto.sectionId) : undefined,
      organizationId: new Types.ObjectId(tenantContext.organizationId),
      floorNumber: dto.floorNumber,
      floorType: dto.floorType,
    });
  }

  @Post('floors/:floorId/units')
  @HttpCode(201)
  @RequirePermission('development', 'edit')
  async createUnit(
    @Req() req: FastifyRequest,
    @Param('floorId') floorId: string,
    @Query('buildingId') buildingIdParam: string,
    @Body() dto: CreateUnitDto,
  ) {
    const tenantContext = requireTenantContext(req);

    // buildingId не часть URL-пути (OpenAPI-спека: POST /floors/{floorId}/units,
    // без buildingId в path) — передаётся query-параметром явно клиентом,
    // сервис всё равно server-side сверяет floor.buildingId с ним (не
    // доверяет напрямую), см. DevelopmentsService.createUnit.
    if (!buildingIdParam) {
      throw new AppException(ErrorCode.VALIDATION_FAILED, 'buildingId query parameter is required');
    }

    return this.developmentsService.createUnit({
      buildingId: new Types.ObjectId(buildingIdParam),
      floorId: new Types.ObjectId(floorId),
      organizationId: new Types.ObjectId(tenantContext.organizationId),
      number: dto.number,
      kind: dto.kind,
      rooms: dto.rooms,
      area: dto.area,
      areaLiving: dto.areaLiving,
      areaBalcony: dto.areaBalcony,
      price: dto.price,
      floorPlanId: dto.floorPlanId ? new Types.ObjectId(dto.floorPlanId) : undefined,
    });
  }

  @Patch('units/:unitId/price')
  @RequirePermission('unit', 'price.update')
  async updateUnitPrice(
    @Req() req: FastifyRequest,
    @Param('unitId') unitId: string,
    @Body() dto: UpdateUnitPriceDto,
  ) {
    const tenantContext = requireTenantContext(req);

    await this.developmentsService.updateUnitPrice({
      unitId: new Types.ObjectId(unitId),
      organizationId: new Types.ObjectId(tenantContext.organizationId),
      expectedVersion: dto.expectedVersion,
      price: dto.price,
      actorIdentityId: new Types.ObjectId(tenantContext.identityId),
      actorPositionId: new Types.ObjectId(tenantContext.positionId),
      correlationId: req.correlationId,
    });

    return this.developmentsService.getUnitForOrganization(
      new Types.ObjectId(unitId),
      new Types.ObjectId(tenantContext.organizationId),
    );
  }

  @Patch('units/:unitId/status')
  @RequirePermission('unit', 'status.update')
  async updateUnitStatus(
    @Req() req: FastifyRequest,
    @Param('unitId') unitId: string,
    @Body() dto: UpdateUnitStatusDto,
  ) {
    const tenantContext = requireTenantContext(req);

    await this.developmentsService.updateUnitStatus({
      unitId: new Types.ObjectId(unitId),
      organizationId: new Types.ObjectId(tenantContext.organizationId),
      expectedVersion: dto.expectedVersion,
      status: dto.status,
      actorIdentityId: new Types.ObjectId(tenantContext.identityId),
      correlationId: req.correlationId,
    });

    return this.developmentsService.getUnitForOrganization(
      new Types.ObjectId(unitId),
      new Types.ObjectId(tenantContext.organizationId),
    );
  }
}
