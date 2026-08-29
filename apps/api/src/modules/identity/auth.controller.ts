import { Body, Controller, HttpCode, Post, Req, Res } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';
import { resolveProductAudienceFromOrigin } from './resolve-product-audience';
import { LoginRequestDto } from './dto/login-request.dto';
import { RegisterRequestDto } from './dto/register-request.dto';

/**
 * OpenAPI `/auth/login` (security: [] — публичный, гость без сессии).
 * ADR-004: единый endpoint для всех трёх продуктов, audience резолвится
 * из Origin-заголовка, не из тела запроса.
 */
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly sessionService: SessionService,
  ) {}

  @Post('login')
  @HttpCode(200)
  async login(
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Body() dto: LoginRequestDto,
  ): Promise<{ identityId: string; requires2fa: boolean }> {
    const audience = resolveProductAudienceFromOrigin(req.headers.origin);

    const result = await this.authService.login({
      login: dto.login,
      password: dto.password,
      audience,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    // ADR-004 host-only cookie: без `domain` (браузер по умолчанию
    // ограничивает cookie точным host запроса, не поддоменом/родительским
    // доменом) — `secure` только в production (dev идёт по http://localhost,
    // браузер отклоняет `secure` cookie на не-HTTPS origin).
    reply.setCookie(SessionService.COOKIE_NAME, result.sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      expires: result.sessionExpiresAt,
    });

    return { identityId: result.identityId.toString(), requires2fa: result.requires2fa };
  }

  /**
   * OpenAPI `/auth/register` (security: [] — публичный). Не создаёт сессию
   * (нет cookie в ответе) — клиент вызывает /auth/login отдельно после
   * успешной регистрации, тот же паттерн, что типичный register→login
   * two-step flow, не auto-login сразу после создания аккаунта (проще
   * рассуждать о том, что 201 Created только создал ресурс, не выполнил
   * побочную авторизационную операцию).
   */
  @Post('register')
  async register(@Body() dto: RegisterRequestDto): Promise<{ identityId: string }> {
    const identityId = await this.authService.registerIdentity({ login: dto.login, password: dto.password });
    return { identityId: identityId.toString() };
  }

  /**
   * Не в узкой OpenAPI-спеке v1-first-vertical-slice.yaml до этого прохода
   * (см. docs/operations/admin-control-plane.md "Не реализовано" п.4) —
   * закрывает честный пробел: SessionService.revokeSession существовал, но
   * не был подключен ни к одному HTTP-маршруту ни для одного audience.
   *
   * Идемпотентен: отсутствие cookie или уже отозванный/несуществующий
   * токен — тот же 200 {loggedOut:true}, не 401/404 (logout не должен
   * палить, была ли сессия вообще валидна — тот же non-disclosure принцип,
   * что уже применяется к login()). Cookie всегда очищается в ответе,
   * даже если сессию в БД искать было не по чему.
   */
  @Post('logout')
  @HttpCode(200)
  async logout(
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<{ loggedOut: true }> {
    const rawToken = this.sessionService.getRawTokenFromRequest(req);
    if (rawToken) {
      await this.sessionService.revokeSession(rawToken);
    }

    reply.clearCookie(SessionService.COOKIE_NAME, { path: '/' });

    return { loggedOut: true };
  }
}
