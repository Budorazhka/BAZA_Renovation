import { Types } from 'mongoose';
import { NotFoundException } from '@nestjs/common';
import { MeController } from './me.controller';
import type { OrganizationsService } from './organizations.service';
import type { TeamService } from './team.service';
import type { AuthService } from '../identity/auth.service';
import type { PolicyEvaluatorService } from '../authorization/policy-evaluator.service';

function makeRequest(organizationId: Types.ObjectId, positionId: Types.ObjectId, identityId: Types.ObjectId) {
  return {
    tenantContext: {
      organizationId: organizationId.toString(),
      positionId: positionId.toString(),
      identityId: identityId.toString(),
    },
  };
}

describe('MeController', () => {
  it('успешно возвращает агрегированный профиль identity + organization + position + permissions', async () => {
    const orgId = new Types.ObjectId();
    const posId = new Types.ObjectId();
    const idId = new Types.ObjectId();

    const authService = {
      findByIds: jest.fn().mockResolvedValue([{ id: idId, normalizedLogin: 'user@example.com', status: 'active' }]),
    } as unknown as AuthService;

    const organizationsService = {
      getOrganizationById: jest.fn().mockResolvedValue({ _id: orgId, name: 'АН Лидер', type: 'agency', status: 'active' }),
    } as unknown as OrganizationsService;

    const teamService = {
      ensureSelf: jest.fn().mockResolvedValue({
        positionId: posId.toString(),
        role: 'manager',
        name: 'Иван Иванов',
        parentPositionId: null,
        avatarUrl: 'https://cdn.example.com/avatar.jpg',
      }),
    } as unknown as TeamService;

    const policyEvaluator = {
      listGrantsForSubject: jest.fn().mockResolvedValue([
        { resource: 'lead', action: 'read', scope: 'own' },
        { resource: 'lead', action: 'create', scope: 'organization' },
        { resource: 'lead', action: 'changeStage', scope: 'own' },
      ]),
    } as unknown as PolicyEvaluatorService;

    const controller = new MeController(organizationsService, teamService, authService, policyEvaluator);
    const result = await controller.me(makeRequest(orgId, posId, idId) as never);

    expect(authService.findByIds).toHaveBeenCalledWith([idId]);
    expect(organizationsService.getOrganizationById).toHaveBeenCalledWith(orgId);
    expect(teamService.ensureSelf).toHaveBeenCalledWith(orgId, posId);
    expect(policyEvaluator.listGrantsForSubject).toHaveBeenCalledWith('position', posId);

    expect(result).toEqual({
      identity: {
        id: idId.toString(),
        login: 'user@example.com',
        status: 'active',
      },
      organization: {
        id: orgId.toString(),
        name: 'АН Лидер',
        type: 'agency',
        status: 'active',
      },
      position: {
        id: posId.toString(),
        role: 'manager',
        displayName: 'Иван Иванов',
        parentPositionId: null,
        avatarUrl: 'https://cdn.example.com/avatar.jpg',
      },
      permissions: [
        { resource: 'lead', action: 'read', scope: 'own', scopeValue: undefined },
        { resource: 'lead', action: 'create', scope: 'organization', scopeValue: undefined },
        { resource: 'lead', action: 'changeStage', scope: 'own', scopeValue: undefined },
      ],
    });
  });

  it('выбрасывает NotFoundException, если Identity не найдена', async () => {
    const orgId = new Types.ObjectId();
    const posId = new Types.ObjectId();
    const idId = new Types.ObjectId();

    const authService = {
      findByIds: jest.fn().mockResolvedValue([]),
    } as unknown as AuthService;

    const organizationsService = {
      getOrganizationById: jest.fn().mockResolvedValue({ _id: orgId, name: 'Орг' }),
    } as unknown as OrganizationsService;

    const teamService = {
      ensureSelf: jest.fn().mockResolvedValue({ positionId: posId.toString() }),
    } as unknown as TeamService;

    const policyEvaluator = {
      listGrantsForSubject: jest.fn().mockResolvedValue([]),
    } as unknown as PolicyEvaluatorService;

    const controller = new MeController(organizationsService, teamService, authService, policyEvaluator);

    await expect(controller.me(makeRequest(orgId, posId, idId) as never)).rejects.toThrow(
      new NotFoundException('Identity not found'),
    );
  });

  it('выбрасывает NotFoundException, если Организация не найдена', async () => {
    const orgId = new Types.ObjectId();
    const posId = new Types.ObjectId();
    const idId = new Types.ObjectId();

    const authService = {
      findByIds: jest.fn().mockResolvedValue([{ id: idId, normalizedLogin: 'user@test.com', status: 'active' }]),
    } as unknown as AuthService;

    const organizationsService = {
      getOrganizationById: jest.fn().mockResolvedValue(null),
    } as unknown as OrganizationsService;

    const teamService = {
      ensureSelf: jest.fn().mockResolvedValue({ positionId: posId.toString() }),
    } as unknown as TeamService;

    const policyEvaluator = {
      listGrantsForSubject: jest.fn().mockResolvedValue([]),
    } as unknown as PolicyEvaluatorService;

    const controller = new MeController(organizationsService, teamService, authService, policyEvaluator);

    await expect(controller.me(makeRequest(orgId, posId, idId) as never)).rejects.toThrow(
      new NotFoundException('Organization not found'),
    );
  });

  it('выбрасывает NotFoundException, если Позиция не найдена', async () => {
    const orgId = new Types.ObjectId();
    const posId = new Types.ObjectId();
    const idId = new Types.ObjectId();

    const authService = {
      findByIds: jest.fn().mockResolvedValue([{ id: idId, normalizedLogin: 'user@test.com', status: 'active' }]),
    } as unknown as AuthService;

    const organizationsService = {
      getOrganizationById: jest.fn().mockResolvedValue({ _id: orgId, name: 'Орг' }),
    } as unknown as OrganizationsService;

    const teamService = {
      ensureSelf: jest.fn().mockResolvedValue(null),
    } as unknown as TeamService;

    const policyEvaluator = {
      listGrantsForSubject: jest.fn().mockResolvedValue([]),
    } as unknown as PolicyEvaluatorService;

    const controller = new MeController(organizationsService, teamService, authService, policyEvaluator);

    await expect(controller.me(makeRequest(orgId, posId, idId) as never)).rejects.toThrow(
      new NotFoundException('Position not found'),
    );
  });
});
