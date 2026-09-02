import { ClientSession, Connection, Types } from 'mongoose';
import { TeamService } from './team.service';
import type { PositionRepository } from './repository/position.repository';
import type { PositionAssignmentRepository } from './repository/position-assignment.repository';
import type { PositionProfileRepository } from './repository/position-profile.repository';
import type { AuthService } from '../identity/auth.service';
import type { MediaService } from '../media/media.service';
import type { OrganizationsService } from './organizations.service';

function makePosition(overrides: Partial<{
  fixedRole: string;
  status: 'vacant' | 'occupied' | 'closed';
  parentPositionId: Types.ObjectId;
  currentOccupantName: string;
  avatarAssetId: Types.ObjectId;
  organizationId: Types.ObjectId;
}> = {}) {
  return {
    _id: new Types.ObjectId(),
    organizationId: overrides.organizationId ?? new Types.ObjectId(),
    fixedRole: overrides.fixedRole ?? 'manager',
    status: overrides.status ?? 'occupied',
    parentPositionId: overrides.parentPositionId,
    currentOccupantName: overrides.currentOccupantName,
    avatarAssetId: overrides.avatarAssetId,
  };
}

/**
 * Соединение, у которого транзакция просто выполняет работу. Настоящую
 * атомарность проверяет интеграционный тест на живом Mongo
 * (team-user-atomicity.integration-spec.ts) — здесь важно лишь то, что шаги
 * идут внутри одной сессии и получают её.
 */
function fakeConnection() {
  const session = { id: 'fake-session' } as unknown as ClientSession;
  return {
    startSession: jest.fn().mockResolvedValue({
      withTransaction: async (work: () => Promise<unknown>) => work(),
      endSession: jest.fn().mockResolvedValue(undefined),
    }),
    __session: session,
  } as unknown as Connection;
}

describe('TeamService.listForOrganization', () => {
  it('занятая позиция обогащается Identity.normalizedLogin занимающего', async () => {
    const organizationId = new Types.ObjectId();
    const identityId = new Types.ObjectId();
    const position = makePosition({ currentOccupantName: 'Иван Иванов', fixedRole: 'rop' });
    const assignment = { positionId: position._id, identityId };

    const service = new TeamService(
      { findAllByOrganization: jest.fn().mockResolvedValue([position]) } as unknown as PositionRepository,
      { findAllActiveByOrganization: jest.fn().mockResolvedValue([assignment]) } as unknown as PositionAssignmentRepository,
      { findByPositionIds: jest.fn().mockResolvedValue([]) } as unknown as PositionProfileRepository,
      { findByIds: jest.fn().mockResolvedValue([{ id: identityId, normalizedLogin: 'ivan@example.com', status: 'active' }]) } as unknown as AuthService,
      {} as unknown as MediaService,
      {} as unknown as OrganizationsService,
      // Connection нужен createOccupiedPosition для транзакции; в этих тестах
      // проверяются чтения, транзакция не открывается.
      {} as unknown as Connection,
    );

    const [view] = await service.listForOrganization(organizationId);

    expect(view).toMatchObject({
      id: position._id.toString(),
      platformUserId: identityId.toString(),
      name: 'Иван Иванов',
      role: 'rop',
      loginEmail: 'ivan@example.com',
      email: 'ivan@example.com',
      status: 'active',
      vacant: false,
    });
  });

  it('вакантная позиция не имеет платформенного пользователя, не вызывает AuthService.findByIds для пустого списка', async () => {
    const organizationId = new Types.ObjectId();
    const vacantPosition = makePosition({ status: 'vacant', fixedRole: 'marketer' });
    const findByIdsSpy = jest.fn().mockResolvedValue([]);

    const service = new TeamService(
      { findAllByOrganization: jest.fn().mockResolvedValue([vacantPosition]) } as unknown as PositionRepository,
      { findAllActiveByOrganization: jest.fn().mockResolvedValue([]) } as unknown as PositionAssignmentRepository,
      { findByPositionIds: jest.fn().mockResolvedValue([]) } as unknown as PositionProfileRepository,
      { findByIds: findByIdsSpy } as unknown as AuthService,
      {} as unknown as MediaService,
      {} as unknown as OrganizationsService,
      // Connection нужен createOccupiedPosition для транзакции; в этих тестах
      // проверяются чтения, транзакция не открывается.
      {} as unknown as Connection,
    );

    const [view] = await service.listForOrganization(organizationId);

    expect(findByIdsSpy).not.toHaveBeenCalled();
    expect(view).toMatchObject({
      platformUserId: '',
      name: '',
      loginEmail: '',
      email: '',
      vacant: true,
      role: 'marketer',
    });
  });

  it('деактивированная Identity мапится в status:blocked (не active, не invited)', async () => {
    const organizationId = new Types.ObjectId();
    const identityId = new Types.ObjectId();
    const position = makePosition();
    const assignment = { positionId: position._id, identityId };

    const service = new TeamService(
      { findAllByOrganization: jest.fn().mockResolvedValue([position]) } as unknown as PositionRepository,
      { findAllActiveByOrganization: jest.fn().mockResolvedValue([assignment]) } as unknown as PositionAssignmentRepository,
      { findByPositionIds: jest.fn().mockResolvedValue([]) } as unknown as PositionProfileRepository,
      { findByIds: jest.fn().mockResolvedValue([{ id: identityId, normalizedLogin: 'x@example.com', status: 'deactivated' }]) } as unknown as AuthService,
      {} as unknown as MediaService,
      {} as unknown as OrganizationsService,
      // Connection нужен createOccupiedPosition для транзакции; в этих тестах
      // проверяются чтения, транзакция не открывается.
      {} as unknown as Connection,
    );

    const [view] = await service.listForOrganization(organizationId);

    expect(view?.status).toBe('blocked');
  });

  it('parentPositionId проецируется и в managerId, и в parentPositionId (фронтенд-легаси дублирование)', async () => {
    const organizationId = new Types.ObjectId();
    const parentId = new Types.ObjectId();
    const position = makePosition({ parentPositionId: parentId });

    const service = new TeamService(
      { findAllByOrganization: jest.fn().mockResolvedValue([position]) } as unknown as PositionRepository,
      { findAllActiveByOrganization: jest.fn().mockResolvedValue([]) } as unknown as PositionAssignmentRepository,
      { findByPositionIds: jest.fn().mockResolvedValue([]) } as unknown as PositionProfileRepository,
      { findByIds: jest.fn() } as unknown as AuthService,
      {} as unknown as MediaService,
      {} as unknown as OrganizationsService,
      // Connection нужен createOccupiedPosition для транзакции; в этих тестах
      // проверяются чтения, транзакция не открывается.
      {} as unknown as Connection,
    );

    const [view] = await service.listForOrganization(organizationId);

    expect(view?.managerId).toBe(parentId.toString());
    expect(view?.parentPositionId).toBe(parentId.toString());
  });
});

describe('TeamService.ensureSelf', () => {
  it('находит вьюху позиции, совпадающей с переданным positionId', async () => {
    const organizationId = new Types.ObjectId();
    const targetPosition = makePosition({ fixedRole: 'owner' });
    const otherPosition = makePosition({ fixedRole: 'manager' });

    const service = new TeamService(
      { findAllByOrganization: jest.fn().mockResolvedValue([otherPosition, targetPosition]) } as unknown as PositionRepository,
      { findAllActiveByOrganization: jest.fn().mockResolvedValue([]) } as unknown as PositionAssignmentRepository,
      { findByPositionIds: jest.fn().mockResolvedValue([]) } as unknown as PositionProfileRepository,
      { findByIds: jest.fn() } as unknown as AuthService,
      {} as unknown as MediaService,
      {} as unknown as OrganizationsService,
      // Connection нужен createOccupiedPosition для транзакции; в этих тестах
      // проверяются чтения, транзакция не открывается.
      {} as unknown as Connection,
    );

    const result = await service.ensureSelf(organizationId, targetPosition._id);

    expect(result?.positionId).toBe(targetPosition._id.toString());
    expect(result?.role).toBe('owner');
  });

  it('возвращает null, если позиция с таким positionId не найдена в организации', async () => {
    const organizationId = new Types.ObjectId();
    const service = new TeamService(
      { findAllByOrganization: jest.fn().mockResolvedValue([makePosition()]) } as unknown as PositionRepository,
      { findAllActiveByOrganization: jest.fn().mockResolvedValue([]) } as unknown as PositionAssignmentRepository,
      { findByPositionIds: jest.fn().mockResolvedValue([]) } as unknown as PositionProfileRepository,
      { findByIds: jest.fn() } as unknown as AuthService,
      {} as unknown as MediaService,
      {} as unknown as OrganizationsService,
      // Connection нужен createOccupiedPosition для транзакции; в этих тестах
      // проверяются чтения, транзакция не открывается.
      {} as unknown as Connection,
    );

    const result = await service.ensureSelf(organizationId, new Types.ObjectId());

    expect(result).toBeNull();
  });
});

describe('TeamService.setPositionOccupantStatus', () => {
  it('status:blocked → вызывает AuthService.deactivateIdentity текущего occupant', async () => {
    const organizationId = new Types.ObjectId();
    const identityId = new Types.ObjectId();
    const position = makePosition();
    const deactivateSpy = jest.fn().mockResolvedValue(undefined);

    const service = new TeamService(
      {
        findAllByOrganization: jest.fn().mockResolvedValue([position]),
        findByIdForOrganization: jest.fn().mockResolvedValue(position),
      } as unknown as PositionRepository,
      {
        findAllActiveByOrganization: jest.fn().mockResolvedValue([{ positionId: position._id, identityId }]),
        findActiveByPosition: jest.fn().mockResolvedValue({ _id: new Types.ObjectId(), identityId }),
      } as unknown as PositionAssignmentRepository,
      { findByPositionIds: jest.fn().mockResolvedValue([]) } as unknown as PositionProfileRepository,
      {
        findByIds: jest.fn().mockResolvedValue([{ id: identityId, normalizedLogin: 'x@example.com', status: 'active' }]),
        deactivateIdentity: deactivateSpy,
      } as unknown as AuthService,
      {} as unknown as MediaService,
      {} as unknown as OrganizationsService,
      // Connection нужен createOccupiedPosition для транзакции; в этих тестах
      // проверяются чтения, транзакция не открывается.
      {} as unknown as Connection,
    );

    await service.setPositionOccupantStatus(position._id, organizationId, 'blocked');

    expect(deactivateSpy).toHaveBeenCalledWith(identityId);
  });

  it('status:active → вызывает AuthService.reactivateIdentity', async () => {
    const position = makePosition();
    const organizationId = new Types.ObjectId();
    const identityId = new Types.ObjectId();
    const reactivateSpy = jest.fn().mockResolvedValue(undefined);

    const service = new TeamService(
      {
        findAllByOrganization: jest.fn().mockResolvedValue([position]),
        findByIdForOrganization: jest.fn().mockResolvedValue(position),
      } as unknown as PositionRepository,
      {
        findAllActiveByOrganization: jest.fn().mockResolvedValue([{ positionId: position._id, identityId }]),
        findActiveByPosition: jest.fn().mockResolvedValue({ _id: new Types.ObjectId(), identityId }),
      } as unknown as PositionAssignmentRepository,
      { findByPositionIds: jest.fn().mockResolvedValue([]) } as unknown as PositionProfileRepository,
      {
        findByIds: jest.fn().mockResolvedValue([{ id: identityId, normalizedLogin: 'x@example.com', status: 'deactivated' }]),
        reactivateIdentity: reactivateSpy,
      } as unknown as AuthService,
      {} as unknown as MediaService,
      {} as unknown as OrganizationsService,
      // Connection нужен createOccupiedPosition для транзакции; в этих тестах
      // проверяются чтения, транзакция не открывается.
      {} as unknown as Connection,
    );

    await service.setPositionOccupantStatus(position._id, organizationId, 'active');

    expect(reactivateSpy).toHaveBeenCalledWith(identityId);
  });

  it('status:invited → VALIDATION_FAILED (нет invite-flow на backend)', async () => {
    const service = new TeamService(
      {} as unknown as PositionRepository,
      {} as unknown as PositionAssignmentRepository,
      { findByPositionIds: jest.fn().mockResolvedValue([]) } as unknown as PositionProfileRepository,
      {} as unknown as AuthService,
      {} as unknown as MediaService,
      {} as unknown as OrganizationsService,
      // Connection нужен createOccupiedPosition для транзакции; в этих тестах
      // проверяются чтения, транзакция не открывается.
      {} as unknown as Connection,
    );

    await expect(
      service.setPositionOccupantStatus(new Types.ObjectId(), new Types.ObjectId(), 'invited'),
    ).rejects.toMatchObject(expect.objectContaining({ code: 'VALIDATION_FAILED' }));
  });

  it('вакантная позиция (нет активного occupant) → VALIDATION_FAILED, не вызывает deactivate/reactivate', async () => {
    const position = makePosition({ status: 'vacant' });
    const deactivateSpy = jest.fn();

    const service = new TeamService(
      { findByIdForOrganization: jest.fn().mockResolvedValue(position) } as unknown as PositionRepository,
      { findActiveByPosition: jest.fn().mockResolvedValue(null) } as unknown as PositionAssignmentRepository,
      { findByPositionIds: jest.fn().mockResolvedValue([]) } as unknown as PositionProfileRepository,
      { deactivateIdentity: deactivateSpy } as unknown as AuthService,
      {} as unknown as MediaService,
      {} as unknown as OrganizationsService,
      // Connection нужен createOccupiedPosition для транзакции; в этих тестах
      // проверяются чтения, транзакция не открывается.
      {} as unknown as Connection,
    );

    await expect(
      service.setPositionOccupantStatus(position._id, new Types.ObjectId(), 'blocked'),
    ).rejects.toMatchObject(expect.objectContaining({ code: 'VALIDATION_FAILED' }));

    expect(deactivateSpy).not.toHaveBeenCalled();
  });

  it('позиция не найдена в организации → NotFoundException', async () => {
    const service = new TeamService(
      { findByIdForOrganization: jest.fn().mockResolvedValue(null) } as unknown as PositionRepository,
      {} as unknown as PositionAssignmentRepository,
      { findByPositionIds: jest.fn().mockResolvedValue([]) } as unknown as PositionProfileRepository,
      {} as unknown as AuthService,
      {} as unknown as MediaService,
      {} as unknown as OrganizationsService,
      // Connection нужен createOccupiedPosition для транзакции; в этих тестах
      // проверяются чтения, транзакция не открывается.
      {} as unknown as Connection,
    );

    await expect(
      service.setPositionOccupantStatus(new Types.ObjectId(), new Types.ObjectId(), 'blocked'),
    ).rejects.toThrow();
  });
});

describe('TeamService.listForOrganization avatarUrl resolution', () => {
  it('позиция с avatarAssetId и verified card-variant получает avatarUrl', async () => {
    const organizationId = new Types.ObjectId();
    const assetId = new Types.ObjectId();
    const position = makePosition({ organizationId, avatarAssetId: assetId });
    const getAssetForOwnerScopeSpy = jest.fn().mockResolvedValue({
      status: 'verified',
      variants: [{ type: 'card', assetPath: 'x/card/1.webp', exifStripped: true }],
      bucket: 'public',
    });
    const getVariantUrlSpy = jest.fn().mockReturnValue('https://cdn.example.com/x/card/1.webp');

    const service = new TeamService(
      { findAllByOrganization: jest.fn().mockResolvedValue([position]) } as unknown as PositionRepository,
      { findAllActiveByOrganization: jest.fn().mockResolvedValue([]) } as unknown as PositionAssignmentRepository,
      { findByPositionIds: jest.fn().mockResolvedValue([]) } as unknown as PositionProfileRepository,
      { findByIds: jest.fn().mockResolvedValue([]) } as unknown as AuthService,
      {
        getAssetForOwnerScope: getAssetForOwnerScopeSpy,
        getVariantUrl: getVariantUrlSpy,
      } as unknown as MediaService,
      {} as unknown as OrganizationsService,
      // Connection нужен createOccupiedPosition для транзакции; в этих тестах
      // проверяются чтения, транзакция не открывается.
      {} as unknown as Connection,
    );

    const [view] = await service.listForOrganization(organizationId);

    expect(getAssetForOwnerScopeSpy).toHaveBeenCalledWith(assetId, { type: 'organization', organizationId });
    expect(view!.avatarUrl).toBe('https://cdn.example.com/x/card/1.webp');
  });

  it('позиция без avatarAssetId — avatarUrl undefined, MediaService не вызывается', async () => {
    const organizationId = new Types.ObjectId();
    const position = makePosition({ organizationId });
    const getAssetForOwnerScopeSpy = jest.fn();

    const service = new TeamService(
      { findAllByOrganization: jest.fn().mockResolvedValue([position]) } as unknown as PositionRepository,
      { findAllActiveByOrganization: jest.fn().mockResolvedValue([]) } as unknown as PositionAssignmentRepository,
      { findByPositionIds: jest.fn().mockResolvedValue([]) } as unknown as PositionProfileRepository,
      { findByIds: jest.fn().mockResolvedValue([]) } as unknown as AuthService,
      { getAssetForOwnerScope: getAssetForOwnerScopeSpy } as unknown as MediaService,
      {} as unknown as OrganizationsService,
      // Connection нужен createOccupiedPosition для транзакции; в этих тестах
      // проверяются чтения, транзакция не открывается.
      {} as unknown as Connection,
    );

    const [view] = await service.listForOrganization(organizationId);

    expect(view!.avatarUrl).toBeUndefined();
    expect(getAssetForOwnerScopeSpy).not.toHaveBeenCalled();
  });

  it('asset ещё pending (worker не построил variants) — avatarUrl undefined, не 500', async () => {
    const organizationId = new Types.ObjectId();
    const assetId = new Types.ObjectId();
    const position = makePosition({ organizationId, avatarAssetId: assetId });

    const service = new TeamService(
      { findAllByOrganization: jest.fn().mockResolvedValue([position]) } as unknown as PositionRepository,
      { findAllActiveByOrganization: jest.fn().mockResolvedValue([]) } as unknown as PositionAssignmentRepository,
      { findByPositionIds: jest.fn().mockResolvedValue([]) } as unknown as PositionProfileRepository,
      { findByIds: jest.fn().mockResolvedValue([]) } as unknown as AuthService,
      {
        getAssetForOwnerScope: jest.fn().mockResolvedValue({ status: 'pending', variants: [], bucket: 'public' }),
      } as unknown as MediaService,
      {} as unknown as OrganizationsService,
      // Connection нужен createOccupiedPosition для транзакции; в этих тестах
      // проверяются чтения, транзакция не открывается.
      {} as unknown as Connection,
    );

    const [view] = await service.listForOrganization(organizationId);

    expect(view!.avatarUrl).toBeUndefined();
  });
});

describe('TeamService.setPositionAvatar', () => {
  it('привязывает verified asset к позиции, возвращает обновлённый view', async () => {
    const organizationId = new Types.ObjectId();
    const assetId = new Types.ObjectId();
    const position = makePosition({ organizationId, avatarAssetId: assetId });
    const positionId = position._id;
    const setAvatarAssetSpy = jest.fn().mockResolvedValue({ matchedCount: 1 });

    const service = new TeamService(
      {
        findByIdForOrganization: jest.fn().mockResolvedValue(position),
        findAllByOrganization: jest.fn().mockResolvedValue([position]),
        setAvatarAsset: setAvatarAssetSpy,
      } as unknown as PositionRepository,
      { findAllActiveByOrganization: jest.fn().mockResolvedValue([]) } as unknown as PositionAssignmentRepository,
      { findByPositionIds: jest.fn().mockResolvedValue([]) } as unknown as PositionProfileRepository,
      { findByIds: jest.fn().mockResolvedValue([]) } as unknown as AuthService,
      {
        getAssetForOwnerScope: jest.fn().mockResolvedValue({ status: 'verified', variants: [], bucket: 'public' }),
      } as unknown as MediaService,
      {} as unknown as OrganizationsService,
      // Connection нужен createOccupiedPosition для транзакции; в этих тестах
      // проверяются чтения, транзакция не открывается.
      {} as unknown as Connection,
    );

    const result = await service.setPositionAvatar(positionId, organizationId, assetId);

    expect(setAvatarAssetSpy).toHaveBeenCalledWith(positionId, assetId);
    expect(result.positionId).toBe(positionId.toString());
  });

  it('позиция не найдена в организации → NotFoundException, не вызывает setAvatarAsset', async () => {
    const setAvatarAssetSpy = jest.fn();
    const service = new TeamService(
      {
        findByIdForOrganization: jest.fn().mockResolvedValue(null),
        setAvatarAsset: setAvatarAssetSpy,
      } as unknown as PositionRepository,
      {} as unknown as PositionAssignmentRepository,
      { findByPositionIds: jest.fn().mockResolvedValue([]) } as unknown as PositionProfileRepository,
      {} as unknown as AuthService,
      {} as unknown as MediaService,
      {} as unknown as OrganizationsService,
      // Connection нужен createOccupiedPosition для транзакции; в этих тестах
      // проверяются чтения, транзакция не открывается.
      {} as unknown as Connection,
    );

    await expect(
      service.setPositionAvatar(new Types.ObjectId(), new Types.ObjectId(), new Types.ObjectId()),
    ).rejects.toThrow();
    expect(setAvatarAssetSpy).not.toHaveBeenCalled();
  });

  it('asset не найден/чужой организации (IDOR) → NotFoundException, не вызывает setAvatarAsset', async () => {
    const organizationId = new Types.ObjectId();
    const positionId = new Types.ObjectId();
    const setAvatarAssetSpy = jest.fn();

    const service = new TeamService(
      {
        findByIdForOrganization: jest.fn().mockResolvedValue(makePosition({ organizationId })),
        setAvatarAsset: setAvatarAssetSpy,
      } as unknown as PositionRepository,
      {} as unknown as PositionAssignmentRepository,
      { findByPositionIds: jest.fn().mockResolvedValue([]) } as unknown as PositionProfileRepository,
      {} as unknown as AuthService,
      { getAssetForOwnerScope: jest.fn().mockResolvedValue(null) } as unknown as MediaService,
      {} as unknown as OrganizationsService,
      // Connection нужен createOccupiedPosition для транзакции; в этих тестах
      // проверяются чтения, транзакция не открывается.
      {} as unknown as Connection,
    );

    await expect(
      service.setPositionAvatar(positionId, organizationId, new Types.ObjectId()),
    ).rejects.toThrow();
    expect(setAvatarAssetSpy).not.toHaveBeenCalled();
  });

  it('asset ещё не verified (pending) → VALIDATION_FAILED, не вызывает setAvatarAsset', async () => {
    const organizationId = new Types.ObjectId();
    const positionId = new Types.ObjectId();
    const setAvatarAssetSpy = jest.fn();

    const service = new TeamService(
      {
        findByIdForOrganization: jest.fn().mockResolvedValue(makePosition({ organizationId })),
        setAvatarAsset: setAvatarAssetSpy,
      } as unknown as PositionRepository,
      {} as unknown as PositionAssignmentRepository,
      { findByPositionIds: jest.fn().mockResolvedValue([]) } as unknown as PositionProfileRepository,
      {} as unknown as AuthService,
      {
        getAssetForOwnerScope: jest.fn().mockResolvedValue({ status: 'pending', variants: [], bucket: 'public' }),
      } as unknown as MediaService,
      {} as unknown as OrganizationsService,
      // Connection нужен createOccupiedPosition для транзакции; в этих тестах
      // проверяются чтения, транзакция не открывается.
      {} as unknown as Connection,
    );

    await expect(
      service.setPositionAvatar(positionId, organizationId, new Types.ObjectId()),
    ).rejects.toThrow();
    expect(setAvatarAssetSpy).not.toHaveBeenCalled();
  });
});

describe('TeamService.createOccupiedPosition', () => {
  it('регистрирует Identity с паролем, создаёт позицию, назначает occupant, сохраняет profile', async () => {
    const organizationId = new Types.ObjectId();
    const managerId = new Types.ObjectId();
    const identityId = new Types.ObjectId();
    const positionId = new Types.ObjectId();
    const actorIdentityId = new Types.ObjectId();

    const registerIdentitySpy = jest.fn().mockResolvedValue(identityId);
    const createVacantPositionSpy = jest.fn().mockResolvedValue(positionId);
    const assignOccupantSpy = jest.fn().mockResolvedValue(new Types.ObjectId());
    const profileCreateSpy = jest.fn().mockResolvedValue(undefined);
    const grantErpAccessSpy = jest.fn().mockResolvedValue(undefined);

    const service = new TeamService(
      {
        findAllByOrganization: jest.fn().mockResolvedValue([makePosition({ organizationId })]),
        findByIdForOrganization: jest.fn(),
      } as unknown as PositionRepository,
      { findAllActiveByOrganization: jest.fn().mockResolvedValue([]) } as unknown as PositionAssignmentRepository,
      {
        findByPositionIds: jest.fn().mockResolvedValue([]),
        create: profileCreateSpy,
      } as unknown as PositionProfileRepository,
      {
        registerIdentity: registerIdentitySpy,
        grantErpAccess: grantErpAccessSpy,
        findByIds: jest.fn().mockResolvedValue([]),
      } as unknown as AuthService,
      {} as unknown as MediaService,
      {
        createVacantPosition: createVacantPositionSpy,
        assignOccupant: assignOccupantSpy,
      } as unknown as OrganizationsService,
      fakeConnection(),
    );

    await service.createOccupiedPosition({
      organizationId,
      actorIdentityId,
      correlationId: 'test-correlation-id',
      fixedRole: 'manager',
      managerId,
      loginEmail: 'new-manager@example.com',
      password: 'password12345',
      occupantDisplayName: 'New Manager',
      profile: { phone: '+79990000000', skills: ['sales'] },
    });

    expect(registerIdentitySpy).toHaveBeenCalledWith({ login: 'new-manager@example.com', password: 'password12345' });
    expect(createVacantPositionSpy).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId, fixedRole: 'manager', parentPositionId: managerId }),
    );
    // Все три шага org-стороны получили одну и ту же сессию — иначе
    // «транзакция» распалась бы на независимые куски.
    const usedSession = createVacantPositionSpy.mock.calls[0][0].session;
    expect(usedSession).toBeDefined();
    expect(assignOccupantSpy.mock.calls[0][0].session).toBe(usedSession);
    expect(profileCreateSpy.mock.calls[0][3]).toBe(usedSession);
    // ProductAccess — коллекция чужого модуля, выдаётся после коммита.
    expect(grantErpAccessSpy).toHaveBeenCalledWith(identityId);
    expect(assignOccupantSpy).toHaveBeenCalledWith(
      expect.objectContaining({ positionId, identityId, occupantDisplayName: 'New Manager', actorIdentityId }),
    );
    expect(profileCreateSpy).toHaveBeenCalledWith(
      positionId,
      organizationId,
      { phone: '+79990000000', skills: ['sales'] },
      expect.anything(),
    );
  });

  it('managerId:null (top-level позиция) — parentPositionId не передаётся в createVacantPosition', async () => {
    const organizationId = new Types.ObjectId();
    const identityId = new Types.ObjectId();
    const positionId = new Types.ObjectId();
    const createVacantPositionSpy = jest.fn().mockResolvedValue(positionId);

    const service = new TeamService(
      { findAllByOrganization: jest.fn().mockResolvedValue([]) } as unknown as PositionRepository,
      { findAllActiveByOrganization: jest.fn().mockResolvedValue([]) } as unknown as PositionAssignmentRepository,
      { findByPositionIds: jest.fn().mockResolvedValue([]), create: jest.fn() } as unknown as PositionProfileRepository,
      {
        registerIdentity: jest.fn().mockResolvedValue(identityId),
        grantErpAccess: jest.fn().mockResolvedValue(undefined),
        findByIds: jest.fn().mockResolvedValue([]),
      } as unknown as AuthService,
      {} as unknown as MediaService,
      {
        createVacantPosition: createVacantPositionSpy,
        assignOccupant: jest.fn().mockResolvedValue(new Types.ObjectId()),
      } as unknown as OrganizationsService,
      fakeConnection(),
    );

    await service.createOccupiedPosition({
      organizationId,
      actorIdentityId: new Types.ObjectId(),
      correlationId: 'test-correlation-id',
      fixedRole: 'owner',
      managerId: null,
      loginEmail: 'owner@example.com',
      password: 'password12345',
      occupantDisplayName: 'Owner',
      profile: {},
    });

    expect(createVacantPositionSpy).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId, fixedRole: 'owner', parentPositionId: undefined }),
    );
  });
});

describe('TeamService.updateProfile', () => {
  it('обновляет HR-профиль существующей позиции', async () => {
    const organizationId = new Types.ObjectId();
    const position = makePosition({ organizationId });
    const positionId = position._id;
    const upsertFieldsSpy = jest.fn().mockResolvedValue(undefined);

    const service = new TeamService(
      {
        findByIdForOrganization: jest.fn().mockResolvedValue(position),
        findAllByOrganization: jest.fn().mockResolvedValue([position]),
      } as unknown as PositionRepository,
      { findAllActiveByOrganization: jest.fn().mockResolvedValue([]) } as unknown as PositionAssignmentRepository,
      {
        findByPositionIds: jest.fn().mockResolvedValue([]),
        upsertFields: upsertFieldsSpy,
      } as unknown as PositionProfileRepository,
      { findByIds: jest.fn().mockResolvedValue([]) } as unknown as AuthService,
      {} as unknown as MediaService,
      {} as unknown as OrganizationsService,
      // Connection нужен createOccupiedPosition для транзакции; в этих тестах
      // проверяются чтения, транзакция не открывается.
      {} as unknown as Connection,
    );

    const result = await service.updateProfile(positionId, organizationId, { city: 'Batumi' });

    expect(upsertFieldsSpy).toHaveBeenCalledWith(positionId, organizationId, { city: 'Batumi' });
    expect(result.positionId).toBe(positionId.toString());
  });

  it('позиция не найдена в организации → NotFoundException, не вызывает upsertFields', async () => {
    const upsertFieldsSpy = jest.fn();
    const service = new TeamService(
      { findByIdForOrganization: jest.fn().mockResolvedValue(null) } as unknown as PositionRepository,
      {} as unknown as PositionAssignmentRepository,
      { upsertFields: upsertFieldsSpy } as unknown as PositionProfileRepository,
      {} as unknown as AuthService,
      {} as unknown as MediaService,
      {} as unknown as OrganizationsService,
      // Connection нужен createOccupiedPosition для транзакции; в этих тестах
      // проверяются чтения, транзакция не открывается.
      {} as unknown as Connection,
    );

    await expect(
      service.updateProfile(new Types.ObjectId(), new Types.ObjectId(), { city: 'Batumi' }),
    ).rejects.toThrow();
    expect(upsertFieldsSpy).not.toHaveBeenCalled();
  });
});
