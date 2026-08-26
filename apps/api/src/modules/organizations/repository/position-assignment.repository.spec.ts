import { ConflictException } from '@nestjs/common';
import { Types } from 'mongoose';
import { PositionAssignmentRepository } from './position-assignment.repository';

/**
 * IAM-002/IAM-003 (ADR-003): попытка создать второй активный assignment
 * для той же identity/position должна детерминированно провалиться как
 * доменная ошибка (ConflictException), не пробросить сырое Mongo-исключение.
 * Реальная enforced-гарантия — partial unique index на уровне БД
 * (проверяется integration-тестом против реального MongoDB replica set,
 * не здесь) — этот unit-тест проверяет только корректность перевода
 * duplicate key error в доменную ошибку на уровне repository-кода.
 */
describe('PositionAssignmentRepository', () => {
  it('createAssignment превращает MongoDB duplicate key error (code 11000) в ConflictException', async () => {
    const duplicateKeyError = Object.assign(new Error('E11000 duplicate key error'), { code: 11000 });
    const mockModel = {
      create: jest.fn().mockRejectedValue(duplicateKeyError),
    };

    const repository = new PositionAssignmentRepository(mockModel as never);

    await expect(
      repository.createAssignment({
        identityId: new Types.ObjectId(),
        positionId: new Types.ObjectId(),
        organizationId: new Types.ObjectId(),
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('createAssignment пробрасывает непредвиденную ошибку без изменений', async () => {
    const unexpectedError = new Error('connection lost');
    const mockModel = {
      create: jest.fn().mockRejectedValue(unexpectedError),
    };

    const repository = new PositionAssignmentRepository(mockModel as never);

    await expect(
      repository.createAssignment({
        identityId: new Types.ObjectId(),
        positionId: new Types.ObjectId(),
        organizationId: new Types.ObjectId(),
      }),
    ).rejects.toThrow('connection lost');
  });

  describe('endAssignment', () => {
    /**
     * Реальный найденный race (second-opinion ревью): фильтр раньше был
     * только по _id — конкурентный повторный вызов на уже завершённом
     * assignment мог перезаписать endedAt/handoverNote более поздним
     * значением. endedAt:{$exists:false} в фильтре — та же TOCTOU-защита,
     * что findActiveByPosition/findActiveByIdentity уже используют для
     * чтения.
     */
    it('фильтр включает endedAt:{$exists:false} — не перезаписывает уже завершённый assignment', async () => {
      const assignmentId = new Types.ObjectId();
      const execSpy = jest.fn().mockResolvedValue({ matchedCount: 1 });
      const updateOneSpy = jest.fn().mockReturnValue({ exec: execSpy });
      const repository = new PositionAssignmentRepository({ updateOne: updateOneSpy } as never);

      const result = await repository.endAssignment(assignmentId, 'handover note');

      expect(updateOneSpy).toHaveBeenCalledWith(
        { _id: assignmentId, endedAt: { $exists: false } },
        { $set: { endedAt: expect.any(Date), handoverNote: 'handover note' } },
        { session: undefined },
      );
      expect(result).toEqual({ matchedCount: 1 });
    });

    it('возвращает matchedCount:0, если assignment уже завершён', async () => {
      const execSpy = jest.fn().mockResolvedValue({ matchedCount: 0 });
      const updateOneSpy = jest.fn().mockReturnValue({ exec: execSpy });
      const repository = new PositionAssignmentRepository({ updateOne: updateOneSpy } as never);

      const result = await repository.endAssignment(new Types.ObjectId());

      expect(result).toEqual({ matchedCount: 0 });
    });
  });
});
