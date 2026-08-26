import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { PositionAssignmentRepository } from './repository/position-assignment.repository';

export interface ActiveAssignment {
  organizationId: string;
  positionId: string;
}

/**
 * Read-only query-сервис, используемый TenantContextMiddleware для построения
 * TenantContext из identityId сессии (ADR-002, ADR-003). Командный слой
 * (создание/занятие/освобождение позиций, транзакционно) — OrganizationsService,
 * не этот класс.
 */
@Injectable()
export class PositionAssignmentService {
  constructor(private readonly positionAssignmentRepository: PositionAssignmentRepository) {}

  async getActiveAssignmentForIdentity(identityId: string): Promise<ActiveAssignment | null> {
    const assignment = await this.positionAssignmentRepository.findActiveByIdentity(
      new Types.ObjectId(identityId),
    );
    if (!assignment) return null;
    return {
      organizationId: assignment.organizationId.toString(),
      positionId: assignment.positionId.toString(),
    };
  }
}
