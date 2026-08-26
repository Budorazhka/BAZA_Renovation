import { CorrelationIdMiddleware } from './correlation-id.middleware';

function makeReplyMock() {
  return { header: jest.fn() };
}

describe('CorrelationIdMiddleware', () => {
  it('генерирует новый correlationId, если заголовок x-correlation-id отсутствует', () => {
    const middleware = new CorrelationIdMiddleware();
    const req = { headers: {} } as never;
    const reply = makeReplyMock();
    const nextSpy = jest.fn();

    middleware.use(req, reply as never, nextSpy);

    expect((req as { correlationId?: string }).correlationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(reply.header).toHaveBeenCalledWith('x-correlation-id', (req as { correlationId: string }).correlationId);
    expect(nextSpy).toHaveBeenCalledTimes(1);
  });

  it('переиспользует входящий x-correlation-id заголовок, не генерирует новый', () => {
    const middleware = new CorrelationIdMiddleware();
    const incomingId = 'client-provided-correlation-id';
    const req = { headers: { 'x-correlation-id': incomingId } } as never;
    const reply = makeReplyMock();

    middleware.use(req, reply as never, jest.fn());

    expect((req as { correlationId?: string }).correlationId).toBe(incomingId);
    expect(reply.header).toHaveBeenCalledWith('x-correlation-id', incomingId);
  });

  it('игнорирует пустую строку в x-correlation-id, генерирует новый', () => {
    const middleware = new CorrelationIdMiddleware();
    const req = { headers: { 'x-correlation-id': '' } } as never;
    const reply = makeReplyMock();

    middleware.use(req, reply as never, jest.fn());

    expect((req as { correlationId?: string }).correlationId).not.toBe('');
    expect((req as { correlationId?: string }).correlationId).toBeTruthy();
  });
});
