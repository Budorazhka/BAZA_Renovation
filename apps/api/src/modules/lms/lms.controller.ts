import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { Types } from 'mongoose';
import { TenantGuard } from '../../shared/tenant/tenant.guard';
import { requireTenantContext } from '../../shared/tenant/tenant-context.middleware';
import { PermissionGuard } from '../authorization/permission.guard';
import { RequirePermission } from '../authorization/require-permission.decorator';
import { AppException } from '../../shared/errors/app-exception';
import { ErrorCode } from '../../shared/errors/error-codes';
import { LmsService } from './lms.service';
import {
  CreateLmsItemDto,
  UpdateLmsItemDto,
  CreateLmsCourseDto,
  UpdateLmsCourseDto,
  UpsertProgressDto,
  ListLmsItemsQueryDto,
  ListLmsCoursesQueryDto,
} from './dto/lms.dto';

@Controller('lms')
@UseGuards(TenantGuard, PermissionGuard)
export class LmsController {
  constructor(private readonly lmsService: LmsService) {}

  // ─── Items (Материалы библиотеки) ──────────────────────────────────────────

  @Get('items')
  @RequirePermission('lms_material', 'read')
  async listItems(@Req() req: FastifyRequest, @Query() query: ListLmsItemsQueryDto) {
    const tenantContext = requireTenantContext(req);
    const data = await this.lmsService.listItems(
      new Types.ObjectId(tenantContext.organizationId),
      query,
    );
    return { success: true, data };
  }

  @Get('items/:id')
  @RequirePermission('lms_material', 'read')
  async getItem(@Req() req: FastifyRequest, @Param('id') id: string) {
    const tenantContext = requireTenantContext(req);
    const data = await this.lmsService.getItem(
      id,
      new Types.ObjectId(tenantContext.organizationId),
    );
    return { success: true, data };
  }

  @Post('items')
  @HttpCode(201)
  @RequirePermission('lms_material', 'manage')
  async createItem(
    @Req() req: FastifyRequest,
    @Body() dto: CreateLmsItemDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const tenantContext = requireTenantContext(req);
    if (!idempotencyKey) {
      throw new AppException(ErrorCode.IDEMPOTENCY_KEY_REQUIRED, 'Idempotency-Key header is required');
    }
    const data = await this.lmsService.createItem({
      organizationId: new Types.ObjectId(tenantContext.organizationId),
      positionId: new Types.ObjectId(tenantContext.positionId),
      identityId: new Types.ObjectId(tenantContext.identityId),
      idempotencyKey,
      data: dto,
    });
    return { success: true, data };
  }

  @Patch('items/:id')
  @RequirePermission('lms_material', 'manage')
  async updateItem(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Body() dto: UpdateLmsItemDto,
  ) {
    const tenantContext = requireTenantContext(req);
    const data = await this.lmsService.updateItem(
      id,
      new Types.ObjectId(tenantContext.organizationId),
      dto,
    );
    return { success: true, data };
  }

  @Delete('items/:id')
  @RequirePermission('lms_material', 'manage')
  async deleteItem(@Req() req: FastifyRequest, @Param('id') id: string) {
    const tenantContext = requireTenantContext(req);
    const data = await this.lmsService.deleteItem(
      id,
      new Types.ObjectId(tenantContext.organizationId),
    );
    return { success: true, data };
  }

  // ─── Courses (Курсы) ───────────────────────────────────────────────────────

  @Get('courses')
  @RequirePermission('lms_course', 'read')
  async listCourses(@Req() req: FastifyRequest, @Query() query: ListLmsCoursesQueryDto) {
    const tenantContext = requireTenantContext(req);
    const data = await this.lmsService.listCourses(
      new Types.ObjectId(tenantContext.organizationId),
      query,
    );
    return { success: true, data };
  }

  @Get('courses/:id')
  @RequirePermission('lms_course', 'read')
  async getCourse(@Req() req: FastifyRequest, @Param('id') id: string) {
    const tenantContext = requireTenantContext(req);
    const data = await this.lmsService.getCourse(
      id,
      new Types.ObjectId(tenantContext.organizationId),
    );
    return { success: true, data };
  }

  @Post('courses')
  @HttpCode(201)
  @RequirePermission('lms_course', 'manage')
  async createCourse(
    @Req() req: FastifyRequest,
    @Body() dto: CreateLmsCourseDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const tenantContext = requireTenantContext(req);
    if (!idempotencyKey) {
      throw new AppException(ErrorCode.IDEMPOTENCY_KEY_REQUIRED, 'Idempotency-Key header is required');
    }
    const data = await this.lmsService.createCourse({
      organizationId: new Types.ObjectId(tenantContext.organizationId),
      positionId: new Types.ObjectId(tenantContext.positionId),
      identityId: new Types.ObjectId(tenantContext.identityId),
      idempotencyKey,
      data: dto,
    });
    return { success: true, data };
  }

  @Patch('courses/:id')
  @RequirePermission('lms_course', 'manage')
  async updateCourse(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Body() dto: UpdateLmsCourseDto,
  ) {
    const tenantContext = requireTenantContext(req);
    const data = await this.lmsService.updateCourse(
      id,
      new Types.ObjectId(tenantContext.organizationId),
      dto,
    );
    return { success: true, data };
  }

  @Delete('courses/:id')
  @RequirePermission('lms_course', 'manage')
  async deleteCourse(@Req() req: FastifyRequest, @Param('id') id: string) {
    const tenantContext = requireTenantContext(req);
    const data = await this.lmsService.deleteCourse(
      id,
      new Types.ObjectId(tenantContext.organizationId),
    );
    return { success: true, data };
  }

  // ─── Progress (Прогресс ученика) ────────────────────────────────────────────

  @Get('progress')
  @RequirePermission('lms_progress', 'read')
  async getProgress(@Req() req: FastifyRequest) {
    const tenantContext = requireTenantContext(req);
    const data = await this.lmsService.getProgress(
      new Types.ObjectId(tenantContext.organizationId),
      new Types.ObjectId(tenantContext.positionId),
    );
    return { success: true, data };
  }

  @Put('progress/:courseId')
  @RequirePermission('lms_progress', 'update')
  async putProgress(
    @Req() req: FastifyRequest,
    @Param('courseId') courseId: string,
    @Body() dto: UpsertProgressDto,
  ) {
    const tenantContext = requireTenantContext(req);
    const data = await this.lmsService.upsertProgress({
      organizationId: new Types.ObjectId(tenantContext.organizationId),
      positionId: new Types.ObjectId(tenantContext.positionId),
      identityId: new Types.ObjectId(tenantContext.identityId),
      courseId,
      data: dto,
      correlationId: req.correlationId,
    });
    return { success: true, data };
  }

  @Delete('progress/:courseId')
  @RequirePermission('lms_progress', 'update')
  async deleteProgress(@Req() req: FastifyRequest, @Param('courseId') courseId: string) {
    const tenantContext = requireTenantContext(req);
    const data = await this.lmsService.deleteProgress(
      new Types.ObjectId(tenantContext.organizationId),
      new Types.ObjectId(tenantContext.positionId),
      courseId,
    );
    return { success: true, data };
  }
}
