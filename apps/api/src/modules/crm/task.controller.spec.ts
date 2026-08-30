import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { TaskController } from './task.controller';
import type { CrmService } from './crm.service';
import type { PolicyEvaluatorService } from '../authorization/policy-evaluator.service';

function makeRequest(organizationId: Types.ObjectId, positionId: Types.ObjectId) {
  return {
    tenantContext: {
      organizationId: organizationId.toString(),
      positionId: positionId.toString(),
      identityId: new Types.ObjectId().toString(),
    },
    correlationId: 'req-corr-123',
  };
}

describe('TaskController', () => {
  describe('listTasks', () => {
    it('scopes query to assignedPositionId for own-grant', async () => {
      const organizationId = new Types.ObjectId();
      const positionId = new Types.ObjectId();
      const listTasks = jest.fn().mockResolvedValue({ items: [], nextCursor: null });
      const matchingScopes = jest.fn().mockResolvedValue(['own']);
      const controller = new TaskController(
        { listTasks } as unknown as CrmService,
        { matchingScopes } as unknown as PolicyEvaluatorService,
      );

      await controller.listTasks(makeRequest(organizationId, positionId) as never, { limit: 20 });

      expect(listTasks).toHaveBeenCalledWith({
        organizationId,
        assignedPositionId: positionId,
        leadId: undefined,
        contactId: undefined,
        status: undefined,
        dueBefore: undefined,
        dueAfter: undefined,
        cursor: undefined,
        limit: 20,
      });
    });

    it('does not scope query to position for organization-grant', async () => {
      const organizationId = new Types.ObjectId();
      const positionId = new Types.ObjectId();
      const listTasks = jest.fn().mockResolvedValue({ items: [], nextCursor: null });
      const matchingScopes = jest.fn().mockResolvedValue(['organization']);
      const controller = new TaskController(
        { listTasks } as unknown as CrmService,
        { matchingScopes } as unknown as PolicyEvaluatorService,
      );

      await controller.listTasks(makeRequest(organizationId, positionId) as never, { limit: 20 });

      expect(listTasks).toHaveBeenCalledWith({
        organizationId,
        assignedPositionId: undefined,
        leadId: undefined,
        contactId: undefined,
        status: undefined,
        dueBefore: undefined,
        dueAfter: undefined,
        cursor: undefined,
        limit: 20,
      });
    });

    it('throws BadRequestException if own-grant user requests tasks of another position', async () => {
      const organizationId = new Types.ObjectId();
      const positionId = new Types.ObjectId();
      const otherPositionId = new Types.ObjectId();
      const controller = new TaskController(
        { listTasks: jest.fn() } as unknown as CrmService,
        { matchingScopes: jest.fn().mockResolvedValue(['own']) } as unknown as PolicyEvaluatorService,
      );

      await expect(
        controller.listTasks(makeRequest(organizationId, positionId) as never, {
          assignedPositionId: otherPositionId.toString(),
          limit: 20,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getTask', () => {
    it('passes resolved owner position filter to getTask', async () => {
      const organizationId = new Types.ObjectId();
      const positionId = new Types.ObjectId();
      const taskId = new Types.ObjectId();
      const getTask = jest.fn().mockResolvedValue({ id: taskId.toString() });
      const controller = new TaskController(
        { getTask } as unknown as CrmService,
        { matchingScopes: jest.fn().mockResolvedValue(['own']) } as unknown as PolicyEvaluatorService,
      );

      await controller.getTask(makeRequest(organizationId, positionId) as never, taskId);

      expect(getTask).toHaveBeenCalledWith({
        taskId,
        organizationId,
        assignedPositionId: positionId,
      });
    });
  });

  describe('createTask', () => {
    it('passes requiredScopePositionId for own-grant user', async () => {
      const organizationId = new Types.ObjectId();
      const positionId = new Types.ObjectId();
      const createTask = jest.fn().mockResolvedValue({ id: 'task-1' });
      const controller = new TaskController(
        { createTask } as unknown as CrmService,
        { matchingScopes: jest.fn().mockResolvedValue(['own']) } as unknown as PolicyEvaluatorService,
      );

      await controller.createTask(makeRequest(organizationId, positionId) as never, {
        title: 'Follow up',
      });

      expect(createTask).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId,
          actorPositionId: positionId,
          requiredScopePositionId: positionId,
          title: 'Follow up',
          correlationId: 'req-corr-123',
        }),
      );
    });
  });

  describe('completeTask', () => {
    it('invokes crmService.completeTask with tenant and position context', async () => {
      const organizationId = new Types.ObjectId();
      const positionId = new Types.ObjectId();
      const taskId = new Types.ObjectId();
      const completeTask = jest.fn().mockResolvedValue({ id: taskId.toString(), status: 'completed' });
      const controller = new TaskController(
        { completeTask } as unknown as CrmService,
        { matchingScopes: jest.fn().mockResolvedValue(['organization']) } as unknown as PolicyEvaluatorService,
      );

      await controller.completeTask(makeRequest(organizationId, positionId) as never, taskId);

      expect(completeTask).toHaveBeenCalledWith({
        taskId,
        organizationId,
        actorPositionId: positionId,
        actorIdentityId: expect.any(Types.ObjectId),
        requiredScopePositionId: undefined,
        correlationId: 'req-corr-123',
      });
    });
  });
});
