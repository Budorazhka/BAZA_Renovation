import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AppException, type AppErrorBody } from './app-exception';
import { ErrorCode, ERROR_CODE_HTTP_STATUS } from './error-codes';

/**
 * Fallback-соответствие HTTP-статуса generic ErrorCode для built-in NestJS
 * исключений (NotFoundException, ConflictException и т.п.), не заведённых
 * через AppException явно. Только статус-generic коды — domain-specific
 * (BOOKING_NOT_FOUND и т.п.) требуют явного AppException в вызывающем коде.
 */
const HTTP_STATUS_FALLBACK_CODE: Partial<Record<number, ErrorCode>> = {
  400: ErrorCode.VALIDATION_FAILED,
  401: ErrorCode.AUTH_INVALID_CREDENTIALS,
  403: ErrorCode.FORBIDDEN,
  404: ErrorCode.NOT_FOUND,
  409: ErrorCode.VERSION_CONFLICT,
  429: ErrorCode.RATE_LIMITED,
};

/**
 * Единственная точка формирования HTTP-ответа для любой ошибки —
 * conventions.md раздел 3. details НИКОГДА не содержит raw exception
 * message/stack trace для непредвиденных ошибок (master plan разд.7.2 п.14).
 */
@Catch()
export class AppExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(AppExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<FastifyReply>();
    const req = ctx.getRequest<FastifyRequest & { correlationId?: string }>();
    const requestId = req.correlationId ?? 'unknown';

    if (exception instanceof AppException) {
      const body: AppErrorBody = {
        error: {
          code: exception.code,
          message: exception.message,
          requestId,
          details: exception.details,
        },
      };
      res.status(exception.getStatus()).send(body);
      return;
    }

    if (exception instanceof HttpException) {
      // NestJS built-in исключения (ValidationPipe, NotFoundException,
      // ConflictException и т.п.) — маппим по HTTP-статусу на ближайший
      // generic ErrorCode, не пропускаем NestJS-специфичный формат наружу.
      // Код должен соответствовать реальному статусу (error-catalog.md) —
      // раньше здесь стоял фиксированный VALIDATION_FAILED для любого
      // built-in исключения, из-за чего NotFoundException(404) отдавал
      // JSON-тело с кодом VALIDATION_FAILED при HTTP-статусе 404.
      const status = exception.getStatus();
      const code = HTTP_STATUS_FALLBACK_CODE[status] ?? ErrorCode.VALIDATION_FAILED;
      const body: AppErrorBody = {
        error: {
          code,
          message: exception.message,
          requestId,
        },
      };
      res.status(status).send(body);
      return;
    }

    // Непредвиденная ошибка — логируем полный stack trace server-side,
    // клиенту отдаём только generic-сообщение (conventions.md раздел 3).
    this.logger.error(
      `Unhandled exception [${requestId}]`,
      exception instanceof Error ? exception.stack : String(exception),
    );
    const body: AppErrorBody = {
      error: {
        code: ErrorCode.INTERNAL_ERROR,
        message: 'Что-то пошло не так, обратитесь в поддержку',
        requestId,
      },
    };
    res.status(ERROR_CODE_HTTP_STATUS[ErrorCode.INTERNAL_ERROR]).send(body);
  }
}
