import { Body, Controller, HttpCode, Param, Post } from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import { ActivateInviteDto } from './dto/activate-invite.dto';

interface ApiResponse<T> {
  success: boolean;
  data: T;
}

/**
 * teamApi.ts::activateInvite(token, password) — /team-users/invite/:token/activate.
 * ОТДЕЛЬНЫЙ контроллер (не метод в TeamController), хотя разделяет тот же
 * URL-префикс 'team-users' — приглашённый ещё не залогинен, не имеет
 * cookie/сессии/TenantContext, значит не может пройти через TeamController,
 * который несёт @UseGuards(TenantGuard) на уровне класса (тот же паттерн,
 * что CrmController отдельно от остальных tenant-scoped controller'ов —
 * публичный endpoint не может жить под guard'ом, который требует сессию).
 */
@Controller('team-users')
export class InvitationController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Post('invite/:token/activate')
  @HttpCode(200)
  async activate(
    @Param('token') token: string,
    @Body() dto: ActivateInviteDto,
  ): Promise<ApiResponse<{ activated: boolean; email: string }>> {
    const { email } = await this.organizationsService.activateInvitation(token, dto.password);
    return { success: true, data: { activated: true, email } };
  }
}
