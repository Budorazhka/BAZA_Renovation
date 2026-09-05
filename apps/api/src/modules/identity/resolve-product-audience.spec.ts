import {
  resolveProductAudienceFromHeaders,
  resolveProductAudienceFromOrigin,
} from './resolve-product-audience';
import { AppException } from '../../shared/errors/app-exception';
import { ErrorCode } from '../../shared/errors/error-codes';

const ORIGINAL_ENV = { ...process.env };

describe('resolveProductAudienceFromOrigin', () => {
  beforeEach(() => {
    process.env.CORS_ALLOWED_ORIGIN_MARKETPLACE = 'https://baza.sale';
    process.env.CORS_ALLOWED_ORIGIN_ERP = 'https://erp.baza.sale';
    process.env.CORS_ALLOWED_ORIGIN_ADMIN = 'https://admin.baza.sale';
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('резолвит marketplace для CORS_ALLOWED_ORIGIN_MARKETPLACE', () => {
    expect(resolveProductAudienceFromOrigin('https://baza.sale')).toBe('marketplace');
  });

  it('резолвит erp для CORS_ALLOWED_ORIGIN_ERP', () => {
    expect(resolveProductAudienceFromOrigin('https://erp.baza.sale')).toBe('erp');
  });

  it('резолвит admin для CORS_ALLOWED_ORIGIN_ADMIN', () => {
    expect(resolveProductAudienceFromOrigin('https://admin.baza.sale')).toBe('admin');
  });

  it('бросает AUTH_AUDIENCE_MISMATCH для нераспознанного origin (не совпадает ни с одним из трёх)', () => {
    expect(() => resolveProductAudienceFromOrigin('https://evil.example.com')).toThrow(
      expect.objectContaining({ code: ErrorCode.AUTH_AUDIENCE_MISMATCH }),
    );
  });

  it('бросает AUTH_AUDIENCE_MISMATCH при отсутствующем Origin-заголовке', () => {
    expect(() => resolveProductAudienceFromOrigin(undefined)).toThrow(AppException);
  });
});

/**
 * Зачем этот блок. Браузер НЕ шлёт Origin на same-origin GET, а фронт по
 * умолчанию ходит в API через свой же прокси (`VITE_API_BASE_URL=/api/v1`).
 * Из-за этого `POST /auth/login` проходил, а следующий `GET /auth/session`
 * падал с AUTH_AUDIENCE_MISMATCH, клиент читал это как «гость», и войти в
 * кабинет было нельзя. Тесты закрепляют оба пути резолва.
 */
describe('resolveProductAudienceFromHeaders', () => {
  beforeEach(() => {
    process.env.CORS_ALLOWED_ORIGIN_MARKETPLACE = 'https://baza.sale';
    process.env.CORS_ALLOWED_ORIGIN_ERP = 'https://erp.baza.sale';
    process.env.CORS_ALLOWED_ORIGIN_ADMIN = 'https://admin.baza.sale';
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('Origin остаётся главным, когда он есть', () => {
    expect(
      resolveProductAudienceFromHeaders({ origin: 'https://admin.baza.sale', host: 'baza.sale', forwardedProto: 'https' }),
    ).toBe('admin');
  });

  it('без Origin резолвит по хосту запроса — это и есть same-origin GET', () => {
    expect(resolveProductAudienceFromHeaders({ host: 'baza.sale', forwardedProto: 'https' })).toBe('marketplace');
    expect(resolveProductAudienceFromHeaders({ host: 'erp.baza.sale', forwardedProto: 'https' })).toBe('erp');
  });

  it('без x-forwarded-proto считает схему http: так приходит локальный стек', () => {
    process.env.CORS_ALLOWED_ORIGIN_MARKETPLACE = 'http://localhost:4173';
    expect(resolveProductAudienceFromHeaders({ host: 'localhost:4173' })).toBe('marketplace');
  });

  it('берёт первую схему, если по пути было несколько прокси', () => {
    expect(resolveProductAudienceFromHeaders({ host: 'baza.sale', forwardedProto: 'https, http' })).toBe('marketplace');
  });

  it('чужой хост не проходит', () => {
    expect(() =>
      resolveProductAudienceFromHeaders({ host: 'evil.example.com', forwardedProto: 'https' }),
    ).toThrow(expect.objectContaining({ code: ErrorCode.AUTH_AUDIENCE_MISMATCH }));
  });

  it('без Origin и без Host отказывает', () => {
    expect(() => resolveProductAudienceFromHeaders({})).toThrow(AppException);
  });

  it('в тексте отказа виден собранный origin — иначе потерянный порт не отличить', () => {
    // Ровно этот случай и был: nginx отдавал `$host` без порта, API получал
    // «localhost» вместо «localhost:4173», и отказ ничего не объяснял.
    expect(() => resolveProductAudienceFromHeaders({ host: 'localhost', forwardedProto: 'http' })).toThrow(
      expect.objectContaining({ message: expect.stringContaining('http://localhost') }),
    );
  });
});
