import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { ClientSession, Connection, Types } from 'mongoose';
import { MarketplacePublicationRepository } from '@baza/publication';
import { DevelopmentRepository, type DevelopmentContact } from '@baza/development';
import { AppException } from '../../shared/errors/app-exception';
import { ErrorCode } from '../../shared/errors/error-codes';
import { runInTransaction } from '../../shared/transactions/run-in-transaction';
import { AuditService } from '../audit/audit.service';
import { ContactRepository } from './repository/contact.repository';
import { LeadRepository } from './repository/lead.repository';
import { LeadEventRepository } from './repository/lead-event.repository';
import type { LeadStage } from './schemas/lead.schema';

/**
 * D-05: master plan "Контакты отсутствуют в list/search HTML/JSON. Reveal
 * — отдельная rate-limited команда с audit/abuse signals. Lead сохраняет
 * source route, publication, UTM/referrer и organizationId. Другие
 * организации не видят факт существования lead/contact."
 */
@Injectable()
export class CrmService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly publicationRepository: MarketplacePublicationRepository,
    private readonly developmentRepository: DevelopmentRepository,
    private readonly contactRepository: ContactRepository,
    private readonly leadRepository: LeadRepository,
    private readonly leadEventRepository: LeadEventRepository,
    private readonly auditService: AuditService,
  ) {}

  /**
   * ADR-005/D-05: slug → published MarketplacePublication → Development
   * (для DevelopmentContact) + Development.organizationId (для Lead).
   * Contact-дедупликация — tenant-local по phone (domain-model.md Module 7
   * invariant): повторный reveal того же телефона той же организацией не
   * создаёт дубль Contact, создаёт НОВЫЙ Lead (source может отличаться —
   * гость мог обратиться дважды из разных источников/каналов, это
   * отдельные обращения для CRM-воронки, не один и тот же лид).
   *
   * Транзакционно: Contact (создан или найден) + Lead + LeadEvent(stage:
   * 'new', changedBy:'system') + audit-запись — ADR-006 паттерн.
   */
  async revealContact(params: {
    slug: string;
    requesterName?: string;
    requesterPhone?: string;
    utm?: Record<string, string>;
    referrer?: string;
    correlationId: string;
  }): Promise<{ phone: string; whatsapp?: string; telegram?: string; leadId: Types.ObjectId }> {
    const publication = await this.publicationRepository.findBySlug(params.slug);
    if (!publication || publication.sourceType !== 'development') {
      throw new NotFoundException('Publication not found');
    }

    const development = await this.developmentRepository.findById(publication.sourceId);
    if (!development) {
      // Publication published, но canonical-сущность недоступна — та же
      // рассинхронизация, что PublicationRequestedHandler трактует как
      // build_failed, здесь на read-пути просто NOT_FOUND, не 500.
      throw new NotFoundException('Publication not found');
    }

    const organizationId = development.organizationId;

    const leadId = await runInTransaction(this.connection, async (session) => {
      const contact = await this.resolveContact(organizationId, params, session);

      const lead = await this.leadRepository.create(
        {
          organizationId,
          contactId: contact._id,
          source: {
            route: `/developments/${params.slug}`,
            publicationId: publication._id,
            utm: params.utm,
            referrer: params.referrer,
          },
        },
        session,
      );

      await this.leadEventRepository.append(
        {
          leadId: lead._id,
          organizationId,
          stage: 'new' as LeadStage,
          changedBy: { type: 'system' },
        },
        session,
      );

      await this.auditService.append(
        {
          // Гость без сессии — нет identityId, значит НЕ actor.type:'identity'
          // (тот тип подразумевает конкретную идентифицированную identity).
          // 'system' — действие, инициированное автоматизированным
          // reveal-flow'ом от лица анонимного гостя, тот же принцип, что
          // и системные stage-переходы LeadEvent ниже.
          actor: { type: 'system' },
          action: 'lead.create_from_reveal',
          resource: 'lead',
          resourceId: lead._id,
          after: { contactId: contact._id.toString(), publicationSlug: params.slug },
          correlationId: params.correlationId,
        },
        session,
      );

      return lead._id;
    });

    return {
      ...extractContactChannels(development.contact),
      leadId,
    };
  }

  /**
   * OpenAPI `assignLead` / permission-matrix.md `lead.assign.organization`.
   * РОП/Директор/Собственник назначает лид на Position менеджера — ручное
   * назначение (domain-model.md owner decision: "Автоматическая раздача
   * может появиться позднее как опция, но не является стартовым
   * поведением"). Не меняет stage (assign ≠ переход воронки) — только
   * ownerPositionId; LeadEvent пишется с ТЕКУЩИМ stage лида (не 'new'),
   * changedBy:{type:'position', positionId: actorPositionId} — фиксирует
   * ФАКТ переназначения в истории, даже если сама стадия не изменилась
   * (та же append-only дисциплина, что LeadEvent.append везде).
   *
   * NotFoundException — единый код для "лид не существует" и "существует
   * в чужой организации" (не раскрываем cross-tenant существование, тот же
   * принцип, что assignOccupant/publication-резолвинг).
   */
  async assignLead(params: {
    leadId: Types.ObjectId;
    assigneePositionId: Types.ObjectId;
    actorPositionId: Types.ObjectId;
    actorIdentityId: Types.ObjectId;
    expectedOrganizationId: Types.ObjectId;
    correlationId: string;
  }) {
    const lead = await this.leadRepository.findByIdForOrganization(params.leadId, params.expectedOrganizationId);
    if (!lead) {
      throw new NotFoundException('Lead not found');
    }

    return runInTransaction(this.connection, async (session) => {
      const { modifiedCount } = await this.leadRepository.assignOwner(
        params.leadId,
        params.expectedOrganizationId,
        params.assigneePositionId,
        session,
      );
      if (modifiedCount === 0) {
        throw new NotFoundException('Lead not found');
      }

      await this.leadEventRepository.append(
        {
          leadId: params.leadId,
          organizationId: params.expectedOrganizationId,
          stage: lead.stage,
          changedBy: { type: 'position', positionId: params.actorPositionId },
        },
        session,
      );

      await this.auditService.append(
        {
          actor: { type: 'identity', id: params.actorIdentityId },
          action: 'lead.assign',
          resource: 'lead',
          resourceId: params.leadId,
          before: { ownerPositionId: lead.ownerPositionId?.toString() ?? null },
          after: { ownerPositionId: params.assigneePositionId.toString() },
          correlationId: params.correlationId,
        },
        session,
      );

      return {
        id: lead._id.toString(),
        organizationId: lead.organizationId.toString(),
        contactId: lead.contactId.toString(),
        ownerPositionId: params.assigneePositionId.toString(),
        stage: lead.stage,
        source: lead.source,
      };
    });
  }

  /**
   * НЕ в узкой OpenAPI-спеке (v1-first-vertical-slice.yaml специфицирует
   * только assignLead) — тот же паттерн, что unit.price.update/status.update
   * в D-01: реализовано, потому что уже часть command-модели domain-model.md
   * Модуль 7 (Lead.stage — денормализованное текущее значение, LeadEvent —
   * append-only история переходов; без HTTP-команды изменить stage
   * невозможно никаким путём, кроме system-переходов вроде revealContact).
   * Ручной переход сотрудником — changedBy:{type:'position'}, отличается от
   * revealContact's changedBy:{type:'system'}.
   */
  async changeLeadStage(params: {
    leadId: Types.ObjectId;
    newStage: LeadStage;
    actorPositionId: Types.ObjectId;
    actorIdentityId: Types.ObjectId;
    expectedOrganizationId: Types.ObjectId;
    correlationId: string;
  }) {
    const lead = await this.leadRepository.findByIdForOrganization(params.leadId, params.expectedOrganizationId);
    if (!lead) {
      throw new NotFoundException('Lead not found');
    }

    const previousStage = lead.stage;

    return runInTransaction(this.connection, async (session) => {
      const { modifiedCount } = await this.leadRepository.changeStage(
        params.leadId,
        params.expectedOrganizationId,
        params.newStage,
        session,
      );
      if (modifiedCount === 0) {
        throw new NotFoundException('Lead not found');
      }

      await this.leadEventRepository.append(
        {
          leadId: params.leadId,
          organizationId: params.expectedOrganizationId,
          stage: params.newStage,
          changedBy: { type: 'position', positionId: params.actorPositionId },
        },
        session,
      );

      await this.auditService.append(
        {
          actor: { type: 'identity', id: params.actorIdentityId },
          action: 'lead.change_stage',
          resource: 'lead',
          resourceId: params.leadId,
          before: { stage: previousStage },
          after: { stage: params.newStage },
          correlationId: params.correlationId,
        },
        session,
      );

      return {
        id: lead._id.toString(),
        organizationId: lead.organizationId.toString(),
        contactId: lead.contactId.toString(),
        ownerPositionId: lead.ownerPositionId?.toString() ?? null,
        stage: params.newStage,
        source: lead.source,
      };
    });
  }

  private async resolveContact(
    organizationId: Types.ObjectId,
    params: { requesterName?: string; requesterPhone?: string },
    session: ClientSession,
  ) {
    if (!params.requesterPhone) {
      // OpenAPI RevealContactRequest.requesterPhone — опционален по
      // контракту, но Contact.phone required по схеме (domain-model.md).
      // Без телефона гостя невозможно создать/найти Contact — явная
      // валидационная ошибка (400, не 404 — запрос синтаксически валиден,
      // просто не хватает данных для выполнения команды; error-catalog.md
      // единый формат ошибок, не built-in NestJS-исключение с неверной
      // семантикой).
      throw new AppException(ErrorCode.VALIDATION_FAILED, 'requesterPhone is required to create a lead');
    }

    const existing = await this.contactRepository.findByPhone(organizationId, params.requesterPhone);
    if (existing) {
      return existing;
    }

    return this.contactRepository.create(
      {
        organizationId,
        name: params.requesterName ?? 'Unknown',
        phone: params.requesterPhone,
        roles: ['buyer'],
      },
      session,
    );
  }
}

function extractContactChannels(contact: DevelopmentContact): {
  phone: string;
  whatsapp?: string;
  telegram?: string;
} {
  return { phone: contact.phone, whatsapp: contact.whatsapp, telegram: contact.telegram };
}
