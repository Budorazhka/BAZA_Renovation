import { HttpException } from '@nestjs/common';
import { ERROR_CODE_HTTP_STATUS, ErrorCode } from './error-codes';

export interface AppErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    requestId: string;
    details?: Record<string, unknown>;
  };
}

/**
 * Единственная точка выброса доменных ошибок — гарантирует, что каждая
 * ошибка API отвечает контракту conventions.md раздел 3: стабильный code,
 * requestId (совпадает с correlationId для трассировки в audit/logs),
 * безопасные details без raw exception message.
 *
 * requestId подставляется в AppExceptionFilter из request context
 * (correlation ID middleware), не передаётся вручную в каждом throw.
 */
export class AppException extends HttpException {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>,
    httpStatus?: number,
  ) {
    super(message, httpStatus ?? ERROR_CODE_HTTP_STATUS[code]);
  }
}
