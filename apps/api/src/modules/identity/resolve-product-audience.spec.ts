import { resolveProductAudienceFromOrigin } from './resolve-product-audience';
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
