import { Types } from 'mongoose';
import { AuditEventRepository } from './audit-event.repository';

function makeChainableModel() {
  const execSpy = jest.fn().mockResolvedValue([]);
  const limitSpy = jest.fn().mockReturnValue({ exec: execSpy });
  const sortSpy = jest.fn().mockReturnValue({ limit: limitSpy });
  const findSpy = jest.fn().mockReturnValue({ sort: sortSpy });
  return { model: { find: findSpy }, findSpy, sortSpy, limitSpy, execSpy };
}

describe('AuditEventRepository.listForAdmin', () => {
  it('сортирует по _id:-1 (newest-first, стабильный курсор без createdAt-коллизий)', async () => {
    const { model, sortSpy } = makeChainableModel();
    const repository = new AuditEventRepository(model as never);

    await repository.listForAdmin({ scopeFilter: {}, limit: 20 });

    expect(sortSpy).toHaveBeenCalledWith({ _id: -1 });
  });

  it('исполняет scopeFilter как есть, не знает про AdminContext/scope', async () => {
    const { model, findSpy } = makeChainableModel();
    const repository = new AuditEventRepository(model as never);
    const scopeFilter = { $and: [{ resource: { $in: ['development', 'unit'] } }, { resourceId: new Types.ObjectId() }] };

    await repository.listForAdmin({ scopeFilter, limit: 20 });

    expect(findSpy).toHaveBeenCalledWith(expect.objectContaining(scopeFilter));
  });

  it('cursor добавляет _id:{$lt:cursor} (не $gt — newest-first, не oldest-first)', async () => {
    const { model, findSpy } = makeChainableModel();
    const repository = new AuditEventRepository(model as never);
    const cursor = new Types.ObjectId();

    await repository.listForAdmin({ scopeFilter: { resource: 'development' }, cursor, limit: 20 });

    expect(findSpy).toHaveBeenCalledWith({ resource: 'development', _id: { $lt: cursor } });
  });

  it('без cursor не добавляет _id-условие вообще (первая страница)', async () => {
    const { model, findSpy } = makeChainableModel();
    const repository = new AuditEventRepository(model as never);

    await repository.listForAdmin({ scopeFilter: { resource: 'development' }, limit: 20 });

    expect(findSpy).toHaveBeenCalledWith({ resource: 'development' });
  });

  it('limit передаётся в .limit() как есть (limit+1 паттерн — забота вызывающего кода)', async () => {
    const { model, limitSpy } = makeChainableModel();
    const repository = new AuditEventRepository(model as never);

    await repository.listForAdmin({ scopeFilter: {}, limit: 21 });

    expect(limitSpy).toHaveBeenCalledWith(21);
  });

  it('пустой scopeFilter ({}) не добавляет фильтр (только limit/sort) — используется для super_admin unfiltered', async () => {
    const { model, findSpy } = makeChainableModel();
    const repository = new AuditEventRepository(model as never);

    await repository.listForAdmin({ scopeFilter: {}, limit: 20 });

    expect(findSpy).toHaveBeenCalledWith({});
  });
});
