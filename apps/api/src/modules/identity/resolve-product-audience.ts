import { AppException } from '../../shared/errors/app-exception';
import { ErrorCode } from '../../shared/errors/error-codes';
import type { ProductAudience } from './schemas/session.schema';

/**
 * ADR-004: "сервер по этому вызову понимает нужный productAudience из
 * самого факта, через какой origin/endpoint пришёл запрос (не по явному
 * полю, присланному клиентом)". Origin-заголовок, не Referer — Origin
 * присутствует на всех same-site/cross-site fetch/XHR запросах (включая
 * простые POST с JSON-телом, что и есть /auth/login), Referer менее
 * надёжен (может отсутствовать при strict referrer-policy) и содержит
 * полный путь, не только origin.
 *
 * Использует те же CORS_ALLOWED_ORIGIN_* переменные, что уже настроены
 * для app.enableCors() в main.api.ts — единственный источник допустимых
 * origin, не дублирующий список в другом месте.
 */
export function resolveProductAudienceFromOrigin(originHeader: string | undefined): ProductAudience {
  if (!originHeader) {
    throw new AppException(ErrorCode.AUTH_AUDIENCE_MISMATCH, 'Missing Origin header — cannot determine product audience');
  }

  const marketplaceOrigin = process.env.CORS_ALLOWED_ORIGIN_MARKETPLACE;
  const erpOrigin = process.env.CORS_ALLOWED_ORIGIN_ERP;
  const adminOrigin = process.env.CORS_ALLOWED_ORIGIN_ADMIN;

  if (marketplaceOrigin && originHeader === marketplaceOrigin) return 'marketplace';
  if (erpOrigin && originHeader === erpOrigin) return 'erp';
  if (adminOrigin && originHeader === adminOrigin) return 'admin';

  throw new AppException(
    ErrorCode.AUTH_AUDIENCE_MISMATCH,
    `Origin "${originHeader}" is not a recognized product origin`,
  );
}
