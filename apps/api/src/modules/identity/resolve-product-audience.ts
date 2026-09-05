import { AppException } from '../../shared/errors/app-exception';
import { ErrorCode } from '../../shared/errors/error-codes';
import type { ProductAudience } from './schemas/session.schema';

/**
 * ADR-004: "сервер по этому вызову понимает нужный productAudience из
 * самого факта, через какой origin/endpoint пришёл запрос (не по явному
 * полю, присланному клиентом)".
 *
 * Использует те же CORS_ALLOWED_ORIGIN_* переменные, что уже настроены
 * для app.enableCors() в main.api.ts — единственный источник допустимых
 * origin, не дублирующий список в другом месте.
 *
 * **Origin есть не всегда.** Прежний комментарий здесь утверждал, что он
 * "присутствует на всех same-site/cross-site fetch/XHR запросах" — это
 * неверно. По Fetch-спецификации браузер шлёт Origin на cross-origin запросы
 * и на любые не-GET/HEAD, но на SAME-ORIGIN GET не шлёт. А фронт по умолчанию
 * ходит в API именно same-origin: `VITE_API_BASE_URL` по умолчанию `/api/v1`,
 * и nginx образа проксирует этот путь в API.
 *
 * Итог был такой: `POST /auth/login` (не-GET, Origin есть) проходил и ставил
 * cookie, а следующий `GET /auth/session` (same-origin GET, Origin нет) падал
 * с AUTH_AUDIENCE_MISMATCH. Клиент читал это как "гость", `RequireAuth` уводил
 * на форму входа, и войти в кабинет было нельзя вообще. Нашлось 05.09.2026 на
 * съёмке экранов: кабинет пять прогонов подряд снимался формой входа.
 *
 * Поэтому при отсутствии Origin аудитория берётся из хоста, которым запрос
 * пришёл — это тот же "факт, через какой origin пришёл запрос", просто взятый
 * из другого заголовка, а не поле от клиента. Подмена Host ничего не даёт:
 * сессия ищется по паре (хеш токена, аудитория), и чужая аудитория просто не
 * найдёт ничего.
 */
function matchConfiguredOrigin(origin: string): ProductAudience | null {
  const marketplaceOrigin = process.env.CORS_ALLOWED_ORIGIN_MARKETPLACE;
  const erpOrigin = process.env.CORS_ALLOWED_ORIGIN_ERP;
  const adminOrigin = process.env.CORS_ALLOWED_ORIGIN_ADMIN;

  if (marketplaceOrigin && origin === marketplaceOrigin) return 'marketplace';
  if (erpOrigin && origin === erpOrigin) return 'erp';
  if (adminOrigin && origin === adminOrigin) return 'admin';
  return null;
}

export function resolveProductAudienceFromOrigin(originHeader: string | undefined): ProductAudience {
  if (!originHeader) {
    throw new AppException(ErrorCode.AUTH_AUDIENCE_MISMATCH, 'Missing Origin header — cannot determine product audience');
  }

  const audience = matchConfiguredOrigin(originHeader);
  if (audience) return audience;

  throw new AppException(
    ErrorCode.AUTH_AUDIENCE_MISMATCH,
    `Origin "${originHeader}" is not a recognized product origin`,
  );
}

/**
 * Аудитория по заголовкам запроса: Origin, а если его нет — хост, которым
 * запрос пришёл.
 *
 * `x-forwarded-proto` ставит прокси фронта (`proxy_set_header X-Forwarded-Proto
 * $scheme` в nginx-spa.conf), `host` — он же (`proxy_set_header Host $host`),
 * то есть это хост, который ввёл в адресную строку человек, а не внутреннее имя
 * контейнера.
 */
export function resolveProductAudienceFromHeaders(headers: {
  origin?: string;
  host?: string;
  forwardedProto?: string;
}): ProductAudience {
  if (headers.origin) return resolveProductAudienceFromOrigin(headers.origin);

  if (headers.host) {
    // Заголовок может нести список, если по пути несколько прокси.
    const proto = (headers.forwardedProto ?? 'http').split(',')[0]!.trim();
    const audience = matchConfiguredOrigin(`${proto}://${headers.host}`);
    if (audience) return audience;
  }

  throw new AppException(
    ErrorCode.AUTH_AUDIENCE_MISMATCH,
    'Neither Origin nor a recognized Host — cannot determine product audience',
  );
}
