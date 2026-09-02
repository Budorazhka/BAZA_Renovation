import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { ClientSession, Connection, Types } from 'mongoose';
import type { MoneyAmount } from '@baza/contracts';
import { MarketplacePublicationRepository } from '@baza/publication';
import { DevelopmentRepository, type DevelopmentContact } from '@baza/development';
import { ListingRepository, PropertyAssetRepository } from '@baza/property-assets';
import { AppException } from '../../shared/errors/app-exception';
import { ErrorCode } from '../../shared/errors/error-codes';
import { runInTransaction } from '../../shared/transactions/run-in-transaction';
import { PublicRevealIdempotencyService } from '../../shared/idempotency/public-reveal-idempotency.service';
import { IdempotencyService } from '../../shared/idempotency/idempotency.service';
import { AuditService } from '../audit/audit.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { OutboxService } from '../outbox/outbox.service';
import { ContactRepository } from './repository/contact.repository';
import { LeadRepository } from './repository/lead.repository';
import { LeadEventRepository } from './repository/lead-event.repository';
import { TaskRepository } from './repository/task.repository';
import { DealRepository } from './repository/deal.repository';
import { DealEventRepository } from './repository/deal-event.repository';
import { DEAL_STAGE_TRANSITIONS, type DealStage } from './deal-stage';
import type { LeadDocument, LeadStage } from './schemas/lead.schema';
import {
  priorityFromFlags,
  type TaskDocument,
  type TaskStatus,
  type TaskPriority,
  type TaskCategory,
  type TaskEntityType,
} from './schemas/task.schema';
import type { DealChecklistItem, DealDocument, DealParticipant } from './schemas/deal.schema';

import type { TimelineEventType } from './dto/list-timeline.dto';

type RevealContactResult = { phone: string; whatsapp?: string; telegram?: string; leadId: Types.ObjectId };

export interface CrmLeadReadModel {
  id: string;
  organizationId: string;
  ownerPositionId: string | null;
  stage: LeadStage;
  version: number;
  source: { route: string; publicationId?: Types.ObjectId; utm?: Record<string, string>; referrer?: string };
  createdAt: string;
  stalled: boolean;
  contact: { id: string; name: string; phone: string; email?: string } | null;
  /**
   * CRM-003 "активный лид без следующего действия" (мягкое правило,
   * owner-подтверждено 30.08.2026 — только read-only индикатор, не
   * блокировка записи): true, если lead.stage активен (ACTIVE_LEAD_STAGES
   * ниже) И у него есть хотя бы одна открытая Task (TaskRepository.
   * countOpenForLead). Для converted/lost лидов — всегда false (правило
   * их не касается, не значит "есть next action").
   */
  hasOpenNextAction: boolean;
}

export interface CrmDealParticipantReadModel {
  role: string;
  contactId: string;
  contact?: { id: string; name: string; phone: string; email?: string } | null;
}

export interface CrmDealChecklistItemReadModel {
  id: string;
  label: string;
  done: boolean;
  completedAt: string | null;
  completedByPositionId: string | null;
}

export interface CrmDealReadModel {
  id: string;
  organizationId: string;
  leadId: string | null;
  contactId: string;
  ownerPositionId: string;
  title: string;
  description: string | null;
  stage: DealStage;
  expectedCommission: MoneyAmount | null;
  participants: CrmDealParticipantReadModel[];
  checklistItems: CrmDealChecklistItemReadModel[];
  version: number;
  createdAt: string;
  updatedAt: string;
  contact?: { id: string; name: string; phone: string; email?: string } | null;
}

export interface CrmTimelineEventReadModel {
  id: string;
  type: TimelineEventType;
  happenedAt: string;
  title: string;
  summary: string | null;
  actor: {
    type: 'position' | 'identity' | 'system' | 'admin_account';
    id: string | null;
  };
  metadata?: Record<string, unknown> | null;
}

export interface CrmLeadEventReadModel {
  id: string;
  leadId: string;
  stage: LeadStage;
  changedBy: { type: 'position' | 'system'; positionId?: string };
  changedAt: string;
}

export interface CrmContactReadModel {
  id: string;
  organizationId: string;
  name: string;
  phone: string;
  email: string | null;
  createdAt: string;
}

export interface CrmTaskReadModel {
  id: string;
  organizationId: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  dueAt: string | null;
  assignedPositionId: string | null;
  leadId: string | null;
  contactId: string | null;
  completedAt: string | null;
  completedByPositionId: string | null;
  createdByPositionId: string | null;
  version: number;
  createdAt: string;
  updatedAt: string | null;

  // Поля, которыми экран задач ERP уже пользуется (требование: интерфейс не
  // меняется, модель подстраивается под него).
  startAt: string | null;
  /** Признаки матрицы Эйзенхауэра — то, что хранится. */
  isUrgent: boolean;
  isImportant: boolean;
  /** Название квадранта для экрана. Выводится из признаков, не хранится. */
  priority: TaskPriority;
  taskCategory: TaskCategory;
  colorHex: string | null;
  reminderOffsetsMinutes: number[];
  subtasks: Array<{ id: string; title: string; done: boolean }>;
  attachmentFileNames: string[];
  entityType: TaskEntityType;
  entityId: string | null;
  isAutomatic: boolean;
  triggerType: string | null;
  /**
   * Просрочена ли задача. НЕ хранится: производное от dueAt и статуса,
   * вычисляется на чтении — иначе поле устаревало бы само каждую полночь.
   */
  isOverdue: boolean;
}

/**
 * CRM-003 "активный лид без следующего действия" — мягкое правило
 * (owner-подтверждено 30.08.2026: только read-only флаг, БЕЗ блокировки
 * записи — changeLeadStage/assignLead не знают про Task вообще, эта
 * константа используется ТОЛЬКО в toLeadReadModel ниже для вычисления
 * hasOpenNextAction). converted/lost исключены: converted — сделка
 * закрыта, lost — лид выпал из активной воронки (LEAD_STAGE_TRANSITIONS
 * выше), ни тот ни другой не нуждается в "следующем действии".
 */
const ACTIVE_LEAD_STAGES: readonly LeadStage[] = ['new', 'contacted', 'qualified'];

/**
 * D-05B: технически решение (не owner decision — тот же статус, что сам
 * LEAD_STAGES список, зафиксированный в lead-stage.ts), явный список
 * допустимых переходов воронки, тот же паттерн, что UNIT_STATUS_TRANSITIONS
 * в developments.service.ts. Раньше ChangeLeadStageDto разрешал любой→любой
 * переход из LEAD_STAGES без проверки последовательности (lost→qualified
 * не блокировался).
 *
 * converted — терминален (сделка совершена, дальше нет "стадии лида").
 * Любой активный stage может уйти в lost (выпадение из воронки на любом
 * этапе квалификации — стандартная B2C-семантика, не искусственно
 * ограничена конкретными source-стадиями). lost→new — единственный
 * reentry-путь: восстановление начинается заново с нуля воронки, не с того
 * же места, где лид "потерялся" (lost→qualified было бы восстановлением
 * прогресса задним числом без повторной квалификации). Версионировано
 * (27.08.2026, LeadDocument.version) — changeLeadStage атомарно проверяет
 * И version, И допустимость перехода в одном Mongo-фильтре, не read-then-
 * write (см. LeadRepository.changeStageWithVersionCheck). assignOwner
 * остаётся невersioned намеренно — вне scope этого фикса.
 */
const LEAD_STAGE_TRANSITIONS: Record<LeadStage, readonly LeadStage[]> = {
  new: ['contacted', 'lost'],
  contacted: ['qualified', 'lost'],
  qualified: ['converted', 'lost'],
  converted: [],
  lost: ['new'],
};

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
    private readonly listingRepository: ListingRepository,
    private readonly propertyAssetRepository: PropertyAssetRepository,
    private readonly contactRepository: ContactRepository,
    private readonly leadRepository: LeadRepository,
    private readonly leadEventRepository: LeadEventRepository,
    private readonly auditService: AuditService,
    private readonly organizationsService: OrganizationsService,
    private readonly publicRevealIdempotencyService: PublicRevealIdempotencyService,
    private readonly idempotencyService: IdempotencyService,
    private readonly taskRepository: TaskRepository,
    private readonly dealRepository: DealRepository,
    private readonly dealEventRepository: DealEventRepository,
    private readonly outboxService: OutboxService,
  ) {}

  /** Tenant-scoped lead lookup for cross-module commands (for example
   * Booking). Returning a single service method keeps LeadRepository behind
   * the CRM module boundary and preserves the non-disclosure 404 semantics.
   */
  async getLeadForOrganization(
    leadId: Types.ObjectId,
    organizationId: Types.ObjectId,
    ownerPositionId?: Types.ObjectId,
  ): Promise<LeadDocument> {
    const lead = await this.leadRepository.findByIdForOrganization(leadId, organizationId, ownerPositionId);
    if (!lead) {
      throw new NotFoundException('Lead not found');
    }
    return lead;
  }

  /**
   * ERP CRM read-path. ownerPositionId передаётся только для own/assigned
   * grants; organization-wide роли получают undefined и видят весь tenant.
   * Нельзя реализовывать это фильтрацией уже после чтения: repository
   * обязан получить ownerPositionId прямо в Mongo-фильтре.
   *
   * Cursor pagination (limit+1 паттерн, тот же принцип, что
   * AdminAuditService.list): repository запрашивается на одну запись
   * больше, чем params.limit — лишняя запись сигнализирует hasMore и
   * становится источником nextCursor (курсор — _id последней ВОЗВРАЩЁННОЙ
   * записи страницы, не лишней), сама лишняя запись отбрасывается перед
   * маппингом в read model.
   */
  async listLeads(params: {
    organizationId: Types.ObjectId;
    ownerPositionId?: Types.ObjectId;
    stage?: LeadStage;
    stalled?: boolean;
    cursor?: Types.ObjectId;
    limit: number;
  }): Promise<{ items: CrmLeadReadModel[]; nextCursor: string | null }> {
    const rows = await this.leadRepository.listForOrganization(params.organizationId, {
      ownerPositionId: params.ownerPositionId,
      stage: params.stage,
      stalled: params.stalled,
      cursor: params.cursor,
      limit: params.limit + 1,
    });
    const hasMore = rows.length > params.limit;
    const leads = hasMore ? rows.slice(0, params.limit) : rows;
    const nextCursor = hasMore ? leads[leads.length - 1]!._id.toString() : null;

    const contactIds = [...new Map(leads.map((lead) => [lead.contactId.toString(), lead.contactId])).values()];
    const contacts = await this.contactRepository.findByIdsForOrganization(params.organizationId, contactIds);
    const contactsById = new Map(contacts.map((contact) => [contact._id.toString(), contact]));

    // CRM-003: один батч-запрос на всю страницу вместо N countOpenForLead —
    // см. TaskRepository.distinctLeadIdsWithOpenTask докстринг.
    const leadIdsWithOpenTask = new Set(
      (await this.taskRepository.distinctLeadIdsWithOpenTask(
        params.organizationId,
        leads.map((lead) => lead._id),
      )).map((id) => id.toString()),
    );

    return {
      items: leads.map((lead) =>
        toLeadReadModel(lead, contactsById.get(lead.contactId.toString()), {
          hasOpenNextAction: isActiveLeadStage(lead.stage) && leadIdsWithOpenTask.has(lead._id.toString()),
        }),
      ),
      nextCursor,
    };
  }

  /**
   * GET /leads/:leadId/events. Tenant/owner scope проверяются ЗДЕСЬ, ДО
   * любого чтения lead_events — findByIdForOrganization уже применяет
   * organizationId (tenant) И, если передан, ownerPositionId (own/assigned
   * сужение), тот же метод, что getLead. Чужой (другая организация или не
   * "свой" при own-grant) и несуществующий лид дают ОДИНАКОВЫЙ
   * NotFoundException — не раскрываем менеджеру факт существования чужого
   * лида через различие 403 vs 404 (тот же non-disclosure принцип, что
   * getLead/changeLeadStage).
   */
  async listLeadEvents(params: {
    leadId: Types.ObjectId;
    organizationId: Types.ObjectId;
    ownerPositionId?: Types.ObjectId;
    cursor?: Types.ObjectId;
    limit: number;
  }): Promise<{ items: CrmLeadEventReadModel[]; nextCursor: string | null }> {
    const lead = await this.leadRepository.findByIdForOrganization(
      params.leadId,
      params.organizationId,
      params.ownerPositionId,
    );
    if (!lead) {
      throw new NotFoundException('Lead not found');
    }

    const rows = await this.leadEventRepository.listForLead(params.leadId, params.organizationId, {
      cursor: params.cursor,
      limit: params.limit + 1,
    });
    const hasMore = rows.length > params.limit;
    const events = hasMore ? rows.slice(0, params.limit) : rows;
    const nextCursor = hasMore ? events[events.length - 1]!._id.toString() : null;

    return { items: events.map(toLeadEventReadModel), nextCursor };
  }

  async getLead(params: {
    leadId: Types.ObjectId;
    organizationId: Types.ObjectId;
    ownerPositionId?: Types.ObjectId;
  }): Promise<CrmLeadReadModel> {
    const lead = await this.leadRepository.findByIdForOrganization(
      params.leadId,
      params.organizationId,
      params.ownerPositionId,
    );
    if (!lead) {
      // Одна реакция для "нет такого" и "не ваш own lead" — не раскрываем
      // менеджеру существование/статус чужого обращения.
      throw new NotFoundException('Lead not found');
    }
    const contact = await this.contactRepository.findByIdForOrganization(lead.contactId, params.organizationId);
    const openTaskCount = isActiveLeadStage(lead.stage)
      ? await this.taskRepository.countOpenForLead(params.organizationId, lead._id)
      : 0;
    return toLeadReadModel(lead, contact, {
      stalled: isActiveLeadStage(lead.stage) && openTaskCount === 0,
      hasOpenNextAction: openTaskCount > 0,
    });
  }

  /**
   * GET /leads/:leadId/timeline.
   * Агрегирует историю стадий, задачи и аудит-события лида в единый timeline.
   */
  async getLeadTimeline(params: {
    leadId: Types.ObjectId;
    organizationId: Types.ObjectId;
    ownerPositionId?: Types.ObjectId;
    type?: TimelineEventType;
    from?: string;
    to?: string;
    cursor?: string;
    limit: number;
  }): Promise<{ items: CrmTimelineEventReadModel[]; nextCursor: string | null }> {
    const lead = await this.leadRepository.findByIdForOrganization(
      params.leadId,
      params.organizationId,
      params.ownerPositionId,
    );
    if (!lead) {
      throw new NotFoundException('Lead not found');
    }

    const [leadEvents, tasks, auditEvents] = await Promise.all([
      this.leadEventRepository.listForLead(params.leadId, params.organizationId),
      this.taskRepository.listForLead(params.organizationId, params.leadId),
      this.auditService.findByResources([params.leadId]),
    ]);

    const events: CrmTimelineEventReadModel[] = [];

    for (const le of leadEvents) {
      events.push({
        id: `le_${le._id.toString()}`,
        type: 'lead_stage_changed',
        happenedAt: le.changedAt ? le.changedAt.toISOString() : new Date().toISOString(),
        title: `Стадия изменена на '${le.stage}'`,
        summary: null,
        actor: {
          type: le.changedBy.type,
          id: le.changedBy.positionId ? le.changedBy.positionId.toString() : null,
        },
        metadata: {
          leadId: le.leadId.toString(),
          stage: le.stage,
        },
      });
    }

    for (const task of tasks) {
      events.push({
        id: `tc_${task._id.toString()}`,
        type: 'task_created',
        happenedAt: task.createdAt ? task.createdAt.toISOString() : new Date().toISOString(),
        title: `Создана задача: ${task.title}`,
        summary: task.description ?? null,
        actor: {
          type: task.assignedPositionId ? 'position' : 'system',
          id: task.assignedPositionId ? task.assignedPositionId.toString() : null,
        },
        metadata: {
          taskId: task._id.toString(),
          status: task.status,
          dueAt: task.dueAt ? task.dueAt.toISOString() : null,
          leadId: task.leadId ? task.leadId.toString() : null,
          contactId: task.contactId ? task.contactId.toString() : null,
        },
      });

      if (task.status === 'completed' && task.completedAt) {
        events.push({
          id: `td_${task._id.toString()}`,
          type: 'task_completed',
          happenedAt: task.completedAt.toISOString(),
          title: `Задача завершена: ${task.title}`,
          summary: null,
          actor: {
            type: task.completedByPositionId ? 'position' : 'system',
            id: task.completedByPositionId ? task.completedByPositionId.toString() : null,
          },
          metadata: {
            taskId: task._id.toString(),
            status: 'completed',
          },
        });
      }

      if (task.status === 'cancelled' && task.updatedAt) {
        events.push({
          id: `tx_${task._id.toString()}`,
          type: 'task_cancelled',
          happenedAt: task.updatedAt.toISOString(),
          title: `Задача отменена: ${task.title}`,
          summary: null,
          actor: {
            type: task.assignedPositionId ? 'position' : 'system',
            id: task.assignedPositionId ? task.assignedPositionId.toString() : null,
          },
          metadata: {
            taskId: task._id.toString(),
            status: 'cancelled',
          },
        });
      }
    }

    for (const ae of auditEvents) {
      if (ae.action === 'lead.assign') {
        events.push({
          id: `ae_${ae._id.toString()}`,
          type: 'lead_assigned',
          happenedAt: ae.createdAt ? ae.createdAt.toISOString() : new Date().toISOString(),
          title: 'Назначен ответственный по лиду',
          summary: ae.reason ?? null,
          actor: {
            type: ae.actor.type,
            id: ae.actor.id ? ae.actor.id.toString() : null,
          },
          metadata: {
            leadId: ae.resourceId.toString(),
            assigneePositionId: ae.after?.ownerPositionId ? String(ae.after.ownerPositionId) : null,
          },
        });
      }
    }

    return paginateTimelineEvents(events, params);
  }

  /**
   * GET /contacts/:contactId/timeline.
   * Агрегирует события контакта и связанных лидов/задач с учётом tenant и own scope.
   */
  async getContactTimeline(params: {
    contactId: Types.ObjectId;
    organizationId: Types.ObjectId;
    ownerPositionId?: Types.ObjectId;
    type?: TimelineEventType;
    from?: string;
    to?: string;
    cursor?: string;
    limit: number;
  }): Promise<{ items: CrmTimelineEventReadModel[]; nextCursor: string | null }> {
    const contact = await this.contactRepository.findByIdForOrganization(
      params.contactId,
      params.organizationId,
    );
    if (!contact) {
      throw new NotFoundException('Contact not found');
    }

    const leadIds = await this.leadRepository.findLeadIdsForContact(
      params.organizationId,
      params.contactId,
      params.ownerPositionId,
    );

    if (params.ownerPositionId && leadIds.length === 0) {
      throw new NotFoundException('Contact not found');
    }

    const [leadEvents, tasks, auditEvents] = await Promise.all([
      this.leadEventRepository.listForLeadIds(params.organizationId, leadIds),
      this.taskRepository.listForContact(params.organizationId, params.contactId),
      this.auditService.findByResources([params.contactId, ...leadIds]),
    ]);

    const visibleTasks = params.ownerPositionId
      ? tasks.filter(
          (t) =>
            t.assignedPositionId?.equals(params.ownerPositionId!) ||
            (t.leadId && leadIds.some((lId) => lId.equals(t.leadId!))),
        )
      : tasks;

    const events: CrmTimelineEventReadModel[] = [];

    for (const le of leadEvents) {
      events.push({
        id: `le_${le._id.toString()}`,
        type: 'lead_stage_changed',
        happenedAt: le.changedAt ? le.changedAt.toISOString() : new Date().toISOString(),
        title: `Стадия изменена на '${le.stage}'`,
        summary: null,
        actor: {
          type: le.changedBy.type,
          id: le.changedBy.positionId ? le.changedBy.positionId.toString() : null,
        },
        metadata: {
          leadId: le.leadId.toString(),
          contactId: params.contactId.toString(),
          stage: le.stage,
        },
      });
    }

    for (const task of visibleTasks) {
      events.push({
        id: `tc_${task._id.toString()}`,
        type: 'task_created',
        happenedAt: task.createdAt ? task.createdAt.toISOString() : new Date().toISOString(),
        title: `Создана задача: ${task.title}`,
        summary: task.description ?? null,
        actor: {
          type: task.assignedPositionId ? 'position' : 'system',
          id: task.assignedPositionId ? task.assignedPositionId.toString() : null,
        },
        metadata: {
          taskId: task._id.toString(),
          status: task.status,
          dueAt: task.dueAt ? task.dueAt.toISOString() : null,
          leadId: task.leadId ? task.leadId.toString() : null,
          contactId: params.contactId.toString(),
        },
      });

      if (task.status === 'completed' && task.completedAt) {
        events.push({
          id: `td_${task._id.toString()}`,
          type: 'task_completed',
          happenedAt: task.completedAt.toISOString(),
          title: `Задача завершена: ${task.title}`,
          summary: null,
          actor: {
            type: task.completedByPositionId ? 'position' : 'system',
            id: task.completedByPositionId ? task.completedByPositionId.toString() : null,
          },
          metadata: {
            taskId: task._id.toString(),
            status: 'completed',
          },
        });
      }

      if (task.status === 'cancelled' && task.updatedAt) {
        events.push({
          id: `tx_${task._id.toString()}`,
          type: 'task_cancelled',
          happenedAt: task.updatedAt.toISOString(),
          title: `Задача отменена: ${task.title}`,
          summary: null,
          actor: {
            type: task.assignedPositionId ? 'position' : 'system',
            id: task.assignedPositionId ? task.assignedPositionId.toString() : null,
          },
          metadata: {
            taskId: task._id.toString(),
            status: 'cancelled',
          },
        });
      }
    }

    for (const ae of auditEvents) {
      if (ae.action === 'lead.assign') {
        events.push({
          id: `ae_${ae._id.toString()}`,
          type: 'lead_assigned',
          happenedAt: ae.createdAt ? ae.createdAt.toISOString() : new Date().toISOString(),
          title: 'Назначен ответственный по лиду',
          summary: ae.reason ?? null,
          actor: {
            type: ae.actor.type,
            id: ae.actor.id ? ae.actor.id.toString() : null,
          },
          metadata: {
            leadId: ae.resourceId.toString(),
            assigneePositionId: ae.after?.ownerPositionId ? String(ae.after.ownerPositionId) : null,
          },
        });
      }
    }

    return paginateTimelineEvents(events, params);
  }

  /**
   * GET /contacts. Contact не хранит ownerPositionId напрямую (в отличие
   * от Lead) — own-scope (manager, contact.read scope:'own',
   * permission-matrix.md) резолвится ТРАНЗИТИВНО через
   * LeadRepository.distinctContactIdsForOwner: "свой" контакт — контакт,
   * связанный хотя бы с одним лидом текущей Position. Это множество
   * резолвится ОДИН раз здесь, до чтения contacts, и передаётся как
   * AND-фильтр `_id: {$in: contactIds}` — не постфильтрация уже
   * прочитанной страницы (та же ошибка класса "пустая страница из-за
   * постфильтрации", которую buildAuditScopeFilter уже избегает для
   * audit_events). organization-scope (owner/director/rop/administrator)
   * получает ownerPositionId:undefined и не резолвит contactIds вовсе —
   * видит весь tenant.
   *
   * `q` — единый поиск по name/phone (не два отдельных query-параметра),
   * регистронезависимый partial-match, метасимволы regex экранируются
   * ДО сборки $regex (escapeRegex ниже) — сырой пользовательский ввод
   * никогда не подставляется в RegExp() как есть (ReDoS/injection).
   */
  async listContacts(params: {
    organizationId: Types.ObjectId;
    ownerPositionId?: Types.ObjectId;
    q?: string;
    cursor?: Types.ObjectId;
    limit: number;
  }): Promise<{ items: CrmContactReadModel[]; nextCursor: string | null }> {
    const contactIds = params.ownerPositionId
      ? await this.leadRepository.distinctContactIdsForOwner(params.organizationId, params.ownerPositionId)
      : undefined;

    const rows = await this.contactRepository.listForOrganization(params.organizationId, {
      contactIds,
      q: params.q ? new RegExp(escapeRegex(params.q), 'i') : undefined,
      cursor: params.cursor,
      limit: params.limit + 1,
    });
    const hasMore = rows.length > params.limit;
    const contacts = hasMore ? rows.slice(0, params.limit) : rows;
    const nextCursor = hasMore ? contacts[contacts.length - 1]!._id.toString() : null;

    return { items: contacts.map(toContactReadModel), nextCursor };
  }

  /**
   * GET /contacts/:contactId. Tenant И own-scope проверяются здесь ДО
   * возврата данных — findByIdForOrganizationScoped принимает уже
   * резолвленное множество "своих" contactId (own-scope) или undefined
   * (organization-scope, весь tenant), тот же принцип, что
   * LeadRepository.findByIdForOrganization(ownerPositionId). Чужой
   * (другая организация ИЛИ не связан ни с одним "своим" лидом при
   * own-scope) и несуществующий contactId дают ОДИНАКОВЫЙ
   * NotFoundException — non-disclosure, тот же паттерн, что getLead.
   */
  async getContact(params: {
    contactId: Types.ObjectId;
    organizationId: Types.ObjectId;
    ownerPositionId?: Types.ObjectId;
  }): Promise<CrmContactReadModel> {
    const contactIds = params.ownerPositionId
      ? await this.leadRepository.distinctContactIdsForOwner(params.organizationId, params.ownerPositionId)
      : undefined;

    const contact = await this.contactRepository.findByIdForOrganizationScoped(
      params.contactId,
      params.organizationId,
      contactIds,
    );
    if (!contact) {
      throw new NotFoundException('Contact not found');
    }
    return toContactReadModel(contact);
  }

  /**
   * GET /tasks. organization-wide роли видят все задачи организации;
   * own-scope роли (manager) видят только задачи, назначенные на их собственную Position.
   * Cursor pagination (limit+1 паттерн).
   */
  async listTasks(params: {
    organizationId: Types.ObjectId;
    assignedPositionId?: Types.ObjectId;
    leadId?: Types.ObjectId;
    contactId?: Types.ObjectId;
    status?: TaskStatus;
    dueBefore?: Date;
    dueAfter?: Date;
    cursor?: Types.ObjectId;
    limit: number;
  }): Promise<{ items: CrmTaskReadModel[]; nextCursor: string | null }> {
    const rows = await this.taskRepository.listForOrganization(params.organizationId, {
      assignedPositionId: params.assignedPositionId,
      leadId: params.leadId,
      contactId: params.contactId,
      status: params.status,
      dueBefore: params.dueBefore,
      dueAfter: params.dueAfter,
      cursor: params.cursor,
      limit: params.limit + 1,
    });
    const hasMore = rows.length > params.limit;
    const tasks = hasMore ? rows.slice(0, params.limit) : rows;
    const nextCursor = hasMore ? tasks[tasks.length - 1]!._id.toString() : null;

    return {
      items: tasks.map(toTaskReadModel),
      nextCursor,
    };
  }

  /**
   * GET /tasks/:taskId. Tenant и own-scope проверяются до возврата —
   * чужая задача возвращает NotFoundException (non-disclosure).
   */
  async getTask(params: {
    taskId: Types.ObjectId;
    organizationId: Types.ObjectId;
    assignedPositionId?: Types.ObjectId;
  }): Promise<CrmTaskReadModel> {
    const task = await this.taskRepository.findByIdForOrganization(
      params.taskId,
      params.organizationId,
      params.assignedPositionId,
    );
    if (!task) {
      throw new NotFoundException('Task not found');
    }
    return toTaskReadModel(task);
  }

  /**
   * POST /tasks. Создание задачи с привязкой к Lead/Contact и аудитом.
   */
  async createTask(params: {
    organizationId: Types.ObjectId;
    actorPositionId: Types.ObjectId;
    actorIdentityId: Types.ObjectId;
    requiredScopePositionId?: Types.ObjectId;
    title: string;
    description?: string;
    dueAt?: Date;
    assignedPositionId?: Types.ObjectId;
    leadId?: Types.ObjectId;
    contactId?: Types.ObjectId;
    startAt?: Date;
    isUrgent?: boolean;
    isImportant?: boolean;
    taskCategory?: TaskCategory;
    colorHex?: string | null;
    reminderOffsetsMinutes?: number[];
    subtasks?: Array<{ id: string; title: string; done: boolean }>;
    attachmentFileNames?: string[];
    correlationId: string;
    /** ADR-006: дубль задачи засоряет список «следующих действий» менеджера. */
    idempotencyKey: string;
    /** Собирается контроллером — см. createLead: хеш checkReplay и record обязан совпадать. */
    idempotencyRequestBody: Record<string, unknown>;
  }): Promise<CrmTaskReadModel> {
    let resolvedContactId = params.contactId;

    if (params.leadId) {
      const lead = await this.leadRepository.findByIdForOrganization(
        params.leadId,
        params.organizationId,
        params.requiredScopePositionId,
      );
      if (!lead) {
        throw new NotFoundException('Lead not found');
      }
      if (!resolvedContactId) {
        resolvedContactId = lead.contactId;
      }
    }

    if (resolvedContactId) {
      const contact = await this.contactRepository.findByIdForOrganization(
        resolvedContactId,
        params.organizationId,
      );
      if (!contact) {
        throw new NotFoundException('Contact not found');
      }
    }

    let targetAssignee = params.assignedPositionId;
    if (params.requiredScopePositionId) {
      if (targetAssignee && !targetAssignee.equals(params.requiredScopePositionId)) {
        throw new BadRequestException('Cannot assign task outside caller scope');
      }
      targetAssignee = params.requiredScopePositionId;
    } else if (!targetAssignee) {
      targetAssignee = params.actorPositionId;
    }

    return runInTransaction(this.connection, async (session) => {
      if (targetAssignee) {
        await this.organizationsService.findAssignablePosition(
          targetAssignee,
          params.organizationId,
          session,
        );
      }

      const task = await this.taskRepository.create(
        {
          organizationId: params.organizationId,
          title: params.title,
          description: params.description,
          dueAt: params.dueAt,
          assignedPositionId: targetAssignee,
          leadId: params.leadId,
          contactId: resolvedContactId,
          status: 'open',
          startAt: params.startAt,
          isUrgent: params.isUrgent,
          isImportant: params.isImportant,
          taskCategory: params.taskCategory,
          colorHex: params.colorHex,
          reminderOffsetsMinutes: params.reminderOffsetsMinutes,
          subtasks: params.subtasks,
          attachmentFileNames: params.attachmentFileNames,
          // Создателя не принимаем из запроса: он берётся из серверного
          // TenantContext, иначе автора задачи можно было бы подделать.
          createdByPositionId: params.actorPositionId,
        },
        session,
      );

      await this.auditService.append(
        {
          actor: { type: 'identity', id: params.actorIdentityId },
          action: 'task.create',
          resource: 'task',
          resourceId: task._id,
          after: {
            title: task.title,
            assignedPositionId: task.assignedPositionId?.toString() ?? null,
            leadId: task.leadId?.toString() ?? null,
            contactId: task.contactId?.toString() ?? null,
            dueAt: task.dueAt?.toISOString() ?? null,
            status: task.status,
          },
          correlationId: params.correlationId,
        },
        session,
      );

      // CRM-004: TaskCreated — только при фактическом POST /tasks, в той же
      // транзакции, что документ+audit (см. taskEventPayload докстринг).
      // Default deduplicationKey (`task:{taskId}:TaskCreated`) достаточен —
      // задача создаётся ОДИН раз, дублирующего create с тем же _id физически
      // не может произойти (новый ObjectId на каждый POST).
      await this.outboxService.publish(
        {
          eventType: 'TaskCreated',
          aggregateType: 'task',
          aggregateId: task._id,
          payload: taskEventPayload(task, {
            actorPositionId: params.actorPositionId,
            correlationId: params.correlationId,
          }),
        },
        session,
      );

      const readModel = toTaskReadModel(task);

      await this.idempotencyService.record(
        {
          identityId: params.actorIdentityId,
          operation: 'createTask',
          key: params.idempotencyKey,
          requestBody: params.idempotencyRequestBody,
          responseStatus: 201,
          responseBody: readModel as unknown as Record<string, unknown>,
        },
        session,
      );

      return readModel;
    });
  }

  /**
   * PATCH /tasks/:taskId. Изменяет title/description/dueAt/status —
   * НИКОГДА assignedPositionId (см. reassignTask ниже: task.reassign —
   * отдельный action/grant от task.edit, тот же принцип, что lead.assign
   * отделён от lead.changeStage в LeadController). conventions.md разд.5
   * optimistic concurrency: expectedVersion проверяется атомарно в одном
   * Mongo-фильтре (TaskRepository.updateTask), modifiedCount:0 после
   * прохождения tenant/scope-проверки — конфликт версии (409), не 404.
   */
  async updateTask(params: {
    taskId: Types.ObjectId;
    organizationId: Types.ObjectId;
    actorPositionId: Types.ObjectId;
    actorIdentityId: Types.ObjectId;
    requiredScopePositionId?: Types.ObjectId;
    expectedVersion: number;
    title?: string;
    description?: string | null;
    dueAt?: Date | null;
    status?: TaskStatus;
    subtasks?: Array<{ id: string; title: string; done: boolean }>;
    correlationId: string;
  }): Promise<CrmTaskReadModel> {
    const existingTask = await this.taskRepository.findByIdForOrganization(
      params.taskId,
      params.organizationId,
      params.requiredScopePositionId,
    );
    if (!existingTask) {
      throw new NotFoundException('Task not found');
    }

    if (existingTask.status === 'completed' && params.status !== 'open') {
      throw new BadRequestException('Cannot edit a completed task');
    }

    return runInTransaction(this.connection, async (session) => {
      const { modifiedCount } = await this.taskRepository.updateTask(
        params.taskId,
        params.organizationId,
        params.expectedVersion,
        {
          title: params.title,
          description: params.description,
          dueAt: params.dueAt,
          status: params.status,
          subtasks: params.subtasks,
        },
        session,
      );
      if (modifiedCount === 0) {
        // Tenant/scope уже подтверждены findByIdForOrganization выше — единственная
        // причина modifiedCount:0 здесь это устаревший expectedVersion (тот же
        // принцип disambiguation, что changeLeadStage/updateUnitPrice).
        throw new ConflictException('Task was modified by another request — refresh and retry');
      }

      const updated = await this.taskRepository.findByIdForOrganization(
        params.taskId,
        params.organizationId,
        undefined,
        session,
      );

      await this.auditService.append(
        {
          actor: { type: 'identity', id: params.actorIdentityId },
          action: 'task.update',
          resource: 'task',
          resourceId: params.taskId,
          before: {
            title: existingTask.title,
            dueAt: existingTask.dueAt?.toISOString() ?? null,
            status: existingTask.status,
          },
          after: {
            title: updated!.title,
            dueAt: updated!.dueAt?.toISOString() ?? null,
            status: updated!.status,
          },
          correlationId: params.correlationId,
        },
        session,
      );

      return toTaskReadModel(updated!);
    });
  }

  /**
   * PATCH /tasks/:taskId/reassign. Единственный путь смены
   * assignedPositionId — task.reassign, отдельный action от task.edit
   * (owner-подтверждено 30.08.2026, тот же паттерн, что lead.assign
   * отделён от lead.changeStage). own-scope (manager, requiredScopePositionId
   * задан) может переназначить ТОЛЬКО задачи, уже назначенные на себя, и
   * ТОЛЬКО на себя же (own-scope не даёт передать задачу коллеге — это
   * реассайн от лица владельца задачи на самого себя, реальный кейс —
   * "снять себя" через null, если понадобится расширить это позже).
   */
  async reassignTask(params: {
    taskId: Types.ObjectId;
    organizationId: Types.ObjectId;
    actorPositionId: Types.ObjectId;
    actorIdentityId: Types.ObjectId;
    requiredScopePositionId?: Types.ObjectId;
    expectedVersion: number;
    assignedPositionId: Types.ObjectId | null;
    correlationId: string;
  }): Promise<CrmTaskReadModel> {
    const existingTask = await this.taskRepository.findByIdForOrganization(
      params.taskId,
      params.organizationId,
      params.requiredScopePositionId,
    );
    if (!existingTask) {
      throw new NotFoundException('Task not found');
    }

    if (
      params.requiredScopePositionId &&
      params.assignedPositionId &&
      !params.assignedPositionId.equals(params.requiredScopePositionId)
    ) {
      throw new BadRequestException('Cannot reassign task outside caller scope');
    }

    // CRM-004: reassign на ТО ЖЕ значение assignedPositionId — не мутация,
    // короткий выход ДО транзакции. Ни version не инкрементируется, ни
    // audit-запись, ни TaskReassigned не публикуются — "переназначение"
    // фактически не произошло, нечего фиксировать как факт изменения (тот
    // же принцип non-event, что modifiedCount:0 у 409, просто другая
    // причина отсутствия эффекта). null===null (оба "не назначено") тоже
    // считается отсутствием изменения.
    const currentAssignee = existingTask.assignedPositionId ?? null;
    const requestedAssignee = params.assignedPositionId;
    const isNoopReassign =
      (currentAssignee === null && requestedAssignee === null) ||
      (currentAssignee !== null && requestedAssignee !== null && currentAssignee.equals(requestedAssignee));
    if (isNoopReassign) {
      return toTaskReadModel(existingTask);
    }

    return runInTransaction(this.connection, async (session) => {
      if (params.assignedPositionId) {
        await this.organizationsService.findAssignablePosition(
          params.assignedPositionId,
          params.organizationId,
          session,
        );
      }

      const { modifiedCount } = await this.taskRepository.reassignTask(
        params.taskId,
        params.organizationId,
        params.expectedVersion,
        params.assignedPositionId,
        session,
      );
      if (modifiedCount === 0) {
        throw new ConflictException('Task was modified by another request — refresh and retry');
      }

      const updated = await this.taskRepository.findByIdForOrganization(
        params.taskId,
        params.organizationId,
        undefined,
        session,
      );

      await this.auditService.append(
        {
          actor: { type: 'identity', id: params.actorIdentityId },
          action: 'task.reassign',
          resource: 'task',
          resourceId: params.taskId,
          before: { assignedPositionId: existingTask.assignedPositionId?.toString() ?? null },
          after: { assignedPositionId: updated!.assignedPositionId?.toString() ?? null },
          correlationId: params.correlationId,
        },
        session,
      );

      // CRM-004: TaskReassigned — только при ФАКТИЧЕСКОЙ смене значения
      // (isNoopReassign выше уже отсеял "reassign на то же самое" до входа
      // в транзакцию). previousAssignedPositionId/newAssignedPositionId —
      // единственное поле, специфичное для этого события (не входит в
      // общий taskEventPayload, т.к. TaskCreated/TaskCompleted его не имеют
      // смысла нести).
      await this.outboxService.publish(
        {
          eventType: 'TaskReassigned',
          aggregateType: 'task',
          aggregateId: params.taskId,
          payload: {
            ...taskEventPayload(updated!, {
              actorPositionId: params.actorPositionId,
              correlationId: params.correlationId,
            }),
            previousAssignedPositionId: existingTask.assignedPositionId?.toString() ?? null,
            newAssignedPositionId: updated!.assignedPositionId?.toString() ?? null,
          },
          deduplicationKey: `task:${params.taskId.toString()}:TaskReassigned:v${params.expectedVersion + 1}`,
        },
        session,
      );

      return toTaskReadModel(updated!);
    });
  }

  /**
   * POST /tasks/:taskId/complete. Завершение задачи с фиксацией времени и
   * исполнителя. Идемпотентно на уровне "уже completed" — повторный вызов
   * с ЛЮБЫМ expectedVersion после успешного завершения просто возвращает
   * текущее состояние, не 409 (тот же UX, что описан в docs — "safe to
   * invoke repeatedly"). Но САМ переход open→completed версионирован —
   * два параллельных complete/update на ОТКРЫТОЙ задаче не оба проходят
   * молча (conventions.md разд.5).
   */
  async completeTask(params: {
    taskId: Types.ObjectId;
    organizationId: Types.ObjectId;
    actorPositionId: Types.ObjectId;
    actorIdentityId: Types.ObjectId;
    requiredScopePositionId?: Types.ObjectId;
    expectedVersion: number;
    correlationId: string;
  }): Promise<CrmTaskReadModel> {
    const existingTask = await this.taskRepository.findByIdForOrganization(
      params.taskId,
      params.organizationId,
      params.requiredScopePositionId,
    );
    if (!existingTask) {
      throw new NotFoundException('Task not found');
    }

    if (existingTask.status === 'completed') {
      return toTaskReadModel(existingTask);
    }

    return runInTransaction(this.connection, async (session) => {
      const { modifiedCount } = await this.taskRepository.completeTask(
        params.taskId,
        params.organizationId,
        params.expectedVersion,
        params.actorPositionId,
        session,
      );
      if (modifiedCount === 0) {
        // version устарела ПРОТИВ ещё открытой задачи — конфликт, не
        // "кто-то уже завершил" (тот случай отловлен выше по свежему
        // прочтению existingTask.status==='completed').
        throw new ConflictException('Task was modified by another request — refresh and retry');
      }

      const completed = await this.taskRepository.findByIdForOrganization(
        params.taskId,
        params.organizationId,
        undefined,
        session,
      );

      await this.auditService.append(
        {
          actor: { type: 'identity', id: params.actorIdentityId },
          action: 'task.complete',
          resource: 'task',
          resourceId: params.taskId,
          before: { status: existingTask.status },
          after: {
            status: 'completed',
            completedByPositionId: params.actorPositionId.toString(),
            completedAt: completed!.completedAt?.toISOString(),
          },
          correlationId: params.correlationId,
        },
        session,
      );

      // CRM-004: TaskCompleted — только на ПЕРВЫЙ фактический open→completed
      // переход. Этот код-путь недостижим ни для 409 (modifiedCount:0 бросил
      // выше, транзакция откатывается, publish никогда не вызывается), ни
      // для идемпотентного повтора уже завершённой задачи (тот случай
      // возвращается ДО runInTransaction — см. `if (existingTask.status ===
      // 'completed')` выше, publish физически не в этой ветке кода).
      // deduplicationKey версионирован — задача может быть completed ровно
      // один раз в своей истории (нет reopen-пути от completed), но explicit
      // версия в ключе следует тому же паттерну, что UnitPriceChanged/
      // UnitStatusChanged, а не полагается на "и так по построению один раз".
      await this.outboxService.publish(
        {
          eventType: 'TaskCompleted',
          aggregateType: 'task',
          aggregateId: params.taskId,
          payload: taskEventPayload(completed!, {
            actorPositionId: params.actorPositionId,
            correlationId: params.correlationId,
          }),
          deduplicationKey: `task:${params.taskId.toString()}:TaskCompleted:v${params.expectedVersion + 1}`,
        },
        session,
      );

      return toTaskReadModel(completed!);
    });
  }

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
    idempotencyKey?: string;
  }): Promise<RevealContactResult> {
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

    return this.revealWithIdempotency({
      slug: params.slug,
      idempotencyKey: params.idempotencyKey,
      requestPayload: {
        requesterName: params.requesterName,
        requesterPhone: params.requesterPhone,
        utm: params.utm,
      },
      buildResponse: (leadId) => ({ ...extractContactChannels(development.contact), leadId }),
      createLead: (session) =>
        this.createLeadForReveal(
          {
            organizationId,
            slug: params.slug,
            route: `/developments/${params.slug}`,
            publicationId: publication._id,
            requesterName: params.requesterName,
            requesterPhone: params.requesterPhone,
            utm: params.utm,
            referrer: params.referrer,
            correlationId: params.correlationId,
          },
          session,
        ),
    });
  }

  /**
   * MKT-002 / LEAD-001: slug → published MarketplacePublication (sourceType: 'listing')
   * → canonical Listing (по sourceId) → canonical PropertyAsset (по propertyAssetId)
   * → PropertyAsset.publisherScope.organizationId (для Lead/Contact)
   * + PropertyAsset.representativePhone (для публичного ответа).
   *
   * Для отсутствующего slug, unpublished publication, publication другого sourceType,
   * отсутствующего Listing, отсутствующего PropertyAsset или не-organization владельца
   * возвращает единый 404 (non-disclosure).
   *
   * Транзакционно: Contact (создан или найден по phone) + Lead(route: `/listings/${slug}`)
   * + LeadEvent(stage: 'new', changedBy: 'system') + audit-запись ('lead.create_from_reveal').
   */
  async revealListingContact(params: {
    slug: string;
    requesterName?: string;
    requesterPhone?: string;
    utm?: Record<string, string>;
    referrer?: string;
    correlationId: string;
    idempotencyKey?: string;
  }): Promise<RevealContactResult> {
    const publication = await this.publicationRepository.findBySlug(params.slug);
    if (!publication || publication.sourceType !== 'listing') {
      throw new NotFoundException('Publication not found');
    }

    const listing = await this.listingRepository.findById(publication.sourceId);
    if (!listing) {
      throw new NotFoundException('Publication not found');
    }

    const propertyAsset = await this.propertyAssetRepository.findById(listing.propertyAssetId);
    if (!propertyAsset) {
      throw new NotFoundException('Publication not found');
    }

    if (propertyAsset.publisherScope.type !== 'organization' || !propertyAsset.publisherScope.organizationId) {
      throw new NotFoundException('Publication not found');
    }

    const organizationId = propertyAsset.publisherScope.organizationId;

    return this.revealWithIdempotency({
      slug: params.slug,
      idempotencyKey: params.idempotencyKey,
      requestPayload: {
        requesterName: params.requesterName,
        requesterPhone: params.requesterPhone,
        utm: params.utm,
      },
      buildResponse: (leadId) => ({ phone: propertyAsset.representativePhone, leadId }),
      createLead: (session) =>
        this.createLeadForReveal(
          {
            organizationId,
            slug: params.slug,
            route: `/listings/${params.slug}`,
            publicationId: publication._id,
            requesterName: params.requesterName,
            requesterPhone: params.requesterPhone,
            utm: params.utm,
            referrer: params.referrer,
            correlationId: params.correlationId,
          },
          session,
        ),
    });
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
      // D-05B: assigneePositionId должен реально существовать, принадлежать
      // ЭТОЙ организации и не быть closed — раньше assignOwner молча
      // назначал лид на чужую/несуществующую/закрытую позицию без ошибки.
      await this.organizationsService.findAssignablePosition(
        params.assigneePositionId,
        params.expectedOrganizationId,
        session,
      );

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
    expectedVersion: number;
    actorPositionId: Types.ObjectId;
    actorIdentityId: Types.ObjectId;
    expectedOrganizationId: Types.ObjectId;
    /**
     * D-05B: manager имеет grant lead.changeStage только со scope 'own' —
     * LeadController передаёт свою позицию сюда в этом случае, undefined
     * для organization/global scope (owner/director/rop). Без этого
     * сужения manager с новым grant мог бы менять stage ЛЮБОГО лида
     * организации, не только своего — PermissionGuard сам по себе не
     * проверяет scope, только наличие гранта (см. PolicyEvaluatorService).
     */
    requiredOwnerPositionId?: Types.ObjectId;
    correlationId: string;
  }) {
    const lead = await this.leadRepository.findByIdForOrganization(
      params.leadId,
      params.expectedOrganizationId,
      params.requiredOwnerPositionId,
    );
    if (!lead) {
      // Единый код и для "не существует", и для "не ваш own lead" — не
      // раскрываем manager'у существование чужого лида (тот же принцип,
      // что getLead с ownerFilterForRead).
      throw new NotFoundException('Lead not found');
    }

    const previousStage = lead.stage;
    // Check the optimistic-concurrency token before validating the transition
    // against the snapshot we just read. A parallel request may have already
    // moved the lead to a stage from which `newStage` is no longer reachable;
    // that is still a stale write and must be reported as 409, not as a 400
    // transition validation error (the client needs to refresh and retry).
    if ((lead.version ?? 0) !== params.expectedVersion) {
      throw new ConflictException('Lead was modified by another request — refresh and retry');
    }

    const allowedFromStages = LEAD_STAGE_TRANSITIONS[previousStage];

    if (!allowedFromStages.includes(params.newStage)) {
      throw new AppException(
        ErrorCode.VALIDATION_FAILED,
        `Cannot transition lead stage from "${previousStage}" to "${params.newStage}"`,
        { from: previousStage, to: params.newStage },
      );
    }

    return runInTransaction(this.connection, async (session) => {
      // conventions.md разд.5 optimistic concurrency (тот же паттерн, что
      // updateUnitStatus): version+stage-transition проверяются АТОМАРНО в
      // одном Mongo-фильтре, не read-then-write — два параллельных
      // changeLeadStage не могут оба пройти на одном и том же previousStage.
      const { modifiedCount } = await this.leadRepository.changeStageWithVersionCheck(
        params.leadId,
        params.expectedOrganizationId,
        params.expectedVersion,
        params.newStage,
        [previousStage],
        session,
      );
      if (modifiedCount === 0) {
        const current = await this.leadRepository.findByIdForOrganization(
          params.leadId,
          params.expectedOrganizationId,
          params.requiredOwnerPositionId,
        );
        if (!current) {
          throw new NotFoundException('Lead not found');
        }
        // Различаем "версия устарела" (конкурентный запрос уже изменил
        // lead — ретрай после refresh валиден, ДАЖЕ если params.newStage
        // не достижим из НОВОГО current.stage: клиент не мог знать об этом
        // в момент своего запроса, это не его ошибка) от "переход запрещён
        // при АКТУАЛЬНОЙ версии" (version совпадает, но сам переход
        // невозможен — ретрай с той же version не поможет). Проверка
        // version первой — тот же принцип, что updateUnitStatus, но там
        // version/status всегда меняются синхронно, здесь дополнительно
        // важно не спутать "стадия ушла дальше" с "переход в принципе
        // недопустим", иначе гонка A→contacted vs A→lost ошибочно вернула
        // бы 400 проигравшему вместо честного 409 (найдено этим же тестом).
        if (current.version !== params.expectedVersion) {
          throw new ConflictException('Lead was modified by another request — refresh and retry');
        }
        throw new AppException(
          ErrorCode.VALIDATION_FAILED,
          `Cannot transition lead stage from "${current.stage}" to "${params.newStage}"`,
          { from: current.stage, to: params.newStage },
        );
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
        version: params.expectedVersion + 1,
        source: lead.source,
      };
    });
  }

  /**
   * Общая идемпотентность-обвязка для revealContact/revealListingContact —
   * обе команды 404/резолюцию slug делают по-разному (development vs
   * listing), но сам Lead-create-транзакционный-flow идентичен, различается
   * только route/response-shape (buildResponse) и conflict-check publication
   * уже сделан вызывающим кодом до сюда. Idempotency-Key ОПЦИОНАЛЕН на этом
   * endpoint (в отличие от ADR-006 publish/book/cancel) — без заголовка
   * ведёт себя как раньше (createLead без всякой idempotency-бухгалтерии).
   */
  private async revealWithIdempotency(params: {
    slug: string;
    idempotencyKey?: string;
    requestPayload: Record<string, unknown>;
    buildResponse: (leadId: Types.ObjectId) => RevealContactResult;
    createLead: (session: ClientSession) => Promise<Types.ObjectId>;
  }): Promise<RevealContactResult> {
    if (!params.idempotencyKey) {
      const leadId = await runInTransaction(this.connection, params.createLead);
      return params.buildResponse(leadId);
    }

    const idempotencyKey = params.idempotencyKey;
    const replay = await this.publicRevealIdempotencyService.checkReplay({
      publicationSlug: params.slug,
      idempotencyKey,
      requestBody: params.requestPayload,
    });
    if (replay) {
      return replayToResult(replay.responseBody);
    }

    try {
      return await runInTransaction(this.connection, async (session) => {
        const leadId = await params.createLead(session);
        const response = params.buildResponse(leadId);

        await this.publicRevealIdempotencyService.record(
          {
            publicationSlug: params.slug,
            idempotencyKey,
            requestBody: params.requestPayload,
            responseStatus: 200,
            responseBody: sanitizeRevealResponse(response),
            leadId,
          },
          session,
        );

        return response;
      });
    } catch (error) {
      // Гонка двух параллельных reveal-contact с одним Idempotency-Key (см.
      // PublicRevealIdempotencyService.record докстринг): проигравший здесь
      // получает duplicate key error, ЕГО транзакция целиком откатывается
      // (Lead/LeadEvent/audit проигравшего не коммитятся) — победитель уже
      // закоммитил свою запись, повторный checkReplay() СНАРУЖИ транзакции
      // находит её и возвращает как честный replay, не пробрасывает 500.
      if (isDuplicateKeyError(error)) {
        const raceReplay = await this.publicRevealIdempotencyService.checkReplay({
          publicationSlug: params.slug,
          idempotencyKey,
          requestBody: params.requestPayload,
        });
        if (raceReplay) {
          return replayToResult(raceReplay.responseBody);
        }
      }
      throw error;
    }
  }

  private async createLeadForReveal(
    params: {
      organizationId: Types.ObjectId;
      slug: string;
      route: string;
      publicationId: Types.ObjectId;
      requesterName?: string;
      requesterPhone?: string;
      utm?: Record<string, string>;
      referrer?: string;
      correlationId: string;
    },
    session: ClientSession,
  ): Promise<Types.ObjectId> {
    const contact = await this.resolveContact(params.organizationId, params, session);

    const lead = await this.leadRepository.create(
      {
        organizationId: params.organizationId,
        contactId: contact._id,
        source: {
          route: params.route,
          publicationId: params.publicationId,
          utm: params.utm,
          referrer: params.referrer,
        },
      },
      session,
    );

    await this.leadEventRepository.append(
      {
        leadId: lead._id,
        organizationId: params.organizationId,
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
        // и системные stage-переходы LeadEvent выше.
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
  }

  /**
   * lead.create.organization — security review 31.08.2026: грант выдан
   * ВСЕМ ролям (owner/director/rop/manager/administrator/developer) в
   * DEFAULT_ROLE_GRANTS, но до этого прохода не существовало НИ ОДНОГО
   * HTTP-пути вручную завести лид в CRM — единственный способ появления
   * Lead был createLeadForReveal (только из анонимного публичного
   * reveal-contact потока). Честный gap, найденный чтением кода, не
   * документа.
   *
   * НЕ назначает ownerPositionId автоматически на actor'а — LeadDocument.
   * ownerPositionId докстринг прямо фиксирует owner decision: "Изначально
   * null... назначается explicit командой assignLead, НЕ auto-assignment
   * по умолчанию" (master plan: "Новый лид назначается РОПом, Директором
   * или Собственником"). Вручную заведённый лид — тот же 'new'/unassigned
   * старт, что и лид с сайта; owner/director/rop назначают его отдельным
   * вызовом assignLead, та же дисциплина для обоих источников.
   *
   * contactId ИЛИ requesterPhone — ровно один способ указать контакт
   * (CreateLeadDto докстринг). resolveContact переиспользует тот же
   * find-by-phone-or-create tenant-local dedupe, что уже применяется в
   * reveal-контуре — не отдельная логика для ERP-стороны.
   */
  async createLead(params: {
    organizationId: Types.ObjectId;
    contactId?: Types.ObjectId;
    requesterName?: string;
    requesterPhone?: string;
    actorPositionId: Types.ObjectId;
    actorIdentityId: Types.ObjectId;
    correlationId: string;
    /** ADR-006: повтор не должен создавать второй лид — дубль искажает воронку. */
    idempotencyKey: string;
    /**
     * Тело для хеша идемпотентности. Приходит ИЗ КОНТРОЛЛЕРА, а не собирается
     * здесь заново: `checkReplay` до транзакции и `record` внутри неё обязаны
     * хешировать одну и ту же форму, иначе повтор просто не найдётся и защита
     * будет мнимой.
     */
    idempotencyRequestBody: Record<string, unknown>;
  }): Promise<CrmLeadReadModel> {
    return runInTransaction(this.connection, async (session) => {
      const contact = params.contactId
        ? await (async () => {
            const found = await this.contactRepository.findByIdForOrganization(params.contactId!, params.organizationId);
            if (!found) {
              throw new NotFoundException('Contact not found');
            }
            return found;
          })()
        : await this.resolveContact(params.organizationId, params, session);

      const lead = await this.leadRepository.create(
        {
          organizationId: params.organizationId,
          contactId: contact._id,
          source: { route: 'manual' },
        },
        session,
      );

      await this.leadEventRepository.append(
        {
          leadId: lead._id,
          organizationId: params.organizationId,
          stage: 'new' as LeadStage,
          changedBy: { type: 'position', positionId: params.actorPositionId },
        },
        session,
      );

      await this.auditService.append(
        {
          actor: { type: 'identity', id: params.actorIdentityId },
          action: 'lead.create',
          resource: 'lead',
          resourceId: lead._id,
          after: { contactId: contact._id.toString(), source: 'manual' },
          correlationId: params.correlationId,
        },
        session,
      );

      const readModel = toLeadReadModel(lead, contact, { stalled: false, hasOpenNextAction: false });

      // ADR-006: запись идемпотентности идёт В ТОЙ ЖЕ транзакции, что и сам
      // лид. Иначе возможен разрыв: лид создан, запись не сохранилась — и
      // повтор создаёт второй лид, то есть ровно то, от чего защищаемся.
      await this.idempotencyService.record(
        {
          identityId: params.actorIdentityId,
          operation: 'createLead',
          key: params.idempotencyKey,
          requestBody: params.idempotencyRequestBody,
          responseStatus: 201,
          responseBody: readModel as unknown as Record<string, unknown>,
        },
        session,
      );

      return readModel;
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

  // ==========================================
  // DEAL CORE (DEAL-001)
  // ==========================================

  async listDeals(params: {
    organizationId: Types.ObjectId;
    ownerPositionId?: Types.ObjectId;
    stage?: DealStage;
    leadId?: Types.ObjectId;
    contactId?: Types.ObjectId;
    cursor?: Types.ObjectId;
    limit: number;
  }): Promise<{ items: CrmDealReadModel[]; nextCursor: string | null }> {
    const rows = await this.dealRepository.listForOrganization(params.organizationId, {
      ownerPositionId: params.ownerPositionId,
      stage: params.stage,
      leadId: params.leadId,
      contactId: params.contactId,
      cursor: params.cursor,
      limit: params.limit + 1,
    });
    const hasMore = rows.length > params.limit;
    const deals = hasMore ? rows.slice(0, params.limit) : rows;
    const nextCursor = hasMore && deals.length > 0 ? deals[deals.length - 1]!._id.toString() : null;

    const contactIdSet = new Set<string>();
    for (const deal of deals) {
      contactIdSet.add(deal.contactId.toString());
      for (const p of deal.participants ?? []) {
        contactIdSet.add(p.contactId.toString());
      }
    }
    const contactObjectIds = [...contactIdSet].map((id) => new Types.ObjectId(id));
    const contacts = await this.contactRepository.findByIdsForOrganization(params.organizationId, contactObjectIds);
    const contactsById = new Map(contacts.map((c) => [c._id.toString(), c]));

    return {
      items: deals.map((deal) => toDealReadModel(deal, contactsById.get(deal.contactId.toString()), contactsById)),
      nextCursor,
    };
  }

  async getDeal(params: {
    dealId: Types.ObjectId;
    organizationId: Types.ObjectId;
    requiredOwnerPositionId?: Types.ObjectId;
  }): Promise<CrmDealReadModel> {
    const deal = await this.dealRepository.findByIdForOrganization(
      params.dealId,
      params.organizationId,
      params.requiredOwnerPositionId,
    );
    if (!deal) {
      throw new NotFoundException('Deal not found');
    }

    const contactIdSet = new Set<string>([deal.contactId.toString()]);
    for (const p of deal.participants ?? []) {
      contactIdSet.add(p.contactId.toString());
    }
    const contactObjectIds = [...contactIdSet].map((id) => new Types.ObjectId(id));
    const contacts = await this.contactRepository.findByIdsForOrganization(params.organizationId, contactObjectIds);
    const contactsById = new Map(contacts.map((c) => [c._id.toString(), c]));

    return toDealReadModel(deal, contactsById.get(deal.contactId.toString()), contactsById);
  }

  async createDeal(params: {
    organizationId: Types.ObjectId;
    contactId: Types.ObjectId;
    ownerPositionId: Types.ObjectId;
    leadId?: Types.ObjectId;
    title: string;
    description?: string;
    stage?: DealStage;
    expectedCommission?: MoneyAmount;
    participants?: Array<{ role: string; contactId: Types.ObjectId }>;
    checklistItems?: Array<{ id?: string; label: string; done?: boolean }>;
    actorPositionId: Types.ObjectId;
    actorIdentityId: Types.ObjectId;
    correlationId: string;
    /** ADR-006: дубль сделки удваивает ожидаемую комиссию в отчётах. */
    idempotencyKey: string;
    /** Собирается контроллером — см. createLead: хеш checkReplay и record обязан совпадать. */
    idempotencyRequestBody: Record<string, unknown>;
  }): Promise<CrmDealReadModel> {
    // 1. Verify primary contact exists in the tenant
    const primaryContact = await this.contactRepository.findByIdForOrganization(
      params.contactId,
      params.organizationId,
    );
    if (!primaryContact) {
      throw new NotFoundException('Contact not found');
    }

    // 2. If leadId provided, verify lead exists in the tenant
    if (params.leadId) {
      const lead = await this.leadRepository.findByIdForOrganization(params.leadId, params.organizationId);
      if (!lead) {
        throw new NotFoundException('Lead not found');
      }
    }

    // 3. If participants provided, verify all contacts exist in the tenant and no duplicate contactIds
    const participantList: DealParticipant[] = [];
    const participantContactsById = new Map<string, typeof primaryContact>();
    participantContactsById.set(primaryContact._id.toString(), primaryContact);

    if (params.participants && params.participants.length > 0) {
      const participantContactIds = params.participants.map((p) => p.contactId);
      const uniqueParticipantIds = new Set(participantContactIds.map((id) => id.toString()));
      if (uniqueParticipantIds.size !== participantContactIds.length) {
        throw new BadRequestException('Duplicate participant contactId provided');
      }

      const pContacts = await this.contactRepository.findByIdsForOrganization(
        params.organizationId,
        participantContactIds,
      );
      if (pContacts.length !== participantContactIds.length) {
        throw new NotFoundException('One or more participant contacts not found');
      }
      for (const pc of pContacts) {
        participantContactsById.set(pc._id.toString(), pc);
      }
      for (const p of params.participants) {
        participantList.push({ role: p.role, contactId: p.contactId });
      }
    }

    // 4. Prepare checklist items
    const initialChecklist: DealChecklistItem[] = (params.checklistItems ?? []).map((item) => ({
      id: item.id || randomUUID(),
      label: item.label,
      done: item.done ?? false,
      completedAt: item.done ? new Date() : undefined,
      completedByPositionId: item.done ? params.actorPositionId : undefined,
    }));

    const initialStage = params.stage ?? 'showing';

    return runInTransaction(this.connection, async (session) => {
      await this.organizationsService.findAssignablePosition(
        params.ownerPositionId,
        params.organizationId,
        session,
      );

      const created = await this.dealRepository.create(
        {
          organizationId: params.organizationId,
          contactId: params.contactId,
          ownerPositionId: params.ownerPositionId,
          leadId: params.leadId,
          title: params.title,
          description: params.description,
          stage: initialStage,
          expectedCommission: params.expectedCommission,
          participants: participantList,
          checklistItems: initialChecklist,
        },
        session,
      );

      await this.dealEventRepository.append(
        {
          dealId: created._id,
          organizationId: params.organizationId,
          stage: initialStage,
          changedBy: { type: 'position', positionId: params.actorPositionId },
        },
        session,
      );

      await this.auditService.append(
        {
          actor: { type: 'identity', id: params.actorIdentityId },
          action: 'deal.create',
          resource: 'deal',
          resourceId: created._id,
          after: {
            id: created._id.toString(),
            title: created.title,
            stage: created.stage,
            contactId: created.contactId.toString(),
            ownerPositionId: created.ownerPositionId.toString(),
            leadId: created.leadId ? created.leadId.toString() : null,
            expectedCommission: created.expectedCommission
              ? {
                  amountMinorUnits: created.expectedCommission.amountMinorUnits,
                  currency: created.expectedCommission.currency,
                }
              : null,
            participantsCount: created.participants?.length ?? 0,
            checklistItemsCount: created.checklistItems?.length ?? 0,
          },
          correlationId: params.correlationId,
        },
        session,
      );

      const readModel = toDealReadModel(created, primaryContact, participantContactsById);

      await this.idempotencyService.record(
        {
          identityId: params.actorIdentityId,
          operation: 'createDeal',
          key: params.idempotencyKey,
          requestBody: params.idempotencyRequestBody,
          responseStatus: 201,
          responseBody: readModel as unknown as Record<string, unknown>,
        },
        session,
      );

      return readModel;
    });
  }

  async updateDeal(params: {
    dealId: Types.ObjectId;
    organizationId: Types.ObjectId;
    requiredOwnerPositionId?: Types.ObjectId;
    title?: string;
    description?: string | null;
    expectedCommission?: MoneyAmount | null;
    expectedVersion: number;
    actorPositionId: Types.ObjectId;
    actorIdentityId: Types.ObjectId;
    correlationId: string;
  }): Promise<CrmDealReadModel> {
    const existing = await this.dealRepository.findByIdForOrganization(
      params.dealId,
      params.organizationId,
      params.requiredOwnerPositionId,
    );
    if (!existing) {
      throw new NotFoundException('Deal not found');
    }
    if ((existing.version ?? 0) !== params.expectedVersion) {
      throw new ConflictException('Deal was modified by another request — refresh and retry');
    }

    return runInTransaction(this.connection, async (session) => {
      const updated = await this.dealRepository.updateDeal(
        params.dealId,
        params.organizationId,
        params.expectedVersion,
        {
          title: params.title,
          description: params.description,
          expectedCommission: params.expectedCommission,
        },
        session,
      );
      if (!updated) {
        const current = await this.dealRepository.findByIdForOrganization(
          params.dealId,
          params.organizationId,
          params.requiredOwnerPositionId,
        );
        if (!current) {
          throw new NotFoundException('Deal not found');
        }
        throw new ConflictException('Deal was modified by another request — refresh and retry');
      }

      await this.auditService.append(
        {
          actor: { type: 'identity', id: params.actorIdentityId },
          action: 'deal.edit',
          resource: 'deal',
          resourceId: updated._id,
          before: {
            title: existing.title,
            description: existing.description ?? null,
            ownerPositionId: existing.ownerPositionId.toString(),
            expectedCommission: existing.expectedCommission
              ? {
                  amountMinorUnits: existing.expectedCommission.amountMinorUnits,
                  currency: existing.expectedCommission.currency,
                }
              : null,
            version: existing.version,
          },
          after: {
            title: updated.title,
            description: updated.description ?? null,
            ownerPositionId: updated.ownerPositionId.toString(),
            expectedCommission: updated.expectedCommission
              ? {
                  amountMinorUnits: updated.expectedCommission.amountMinorUnits,
                  currency: updated.expectedCommission.currency,
                }
              : null,
            version: updated.version,
          },
          correlationId: params.correlationId,
        },
        session,
      );

      const contactIdSet = new Set<string>([updated.contactId.toString()]);
      for (const p of updated.participants ?? []) {
        contactIdSet.add(p.contactId.toString());
      }
      const contactObjectIds = [...contactIdSet].map((id) => new Types.ObjectId(id));
      const contacts = await this.contactRepository.findByIdsForOrganization(params.organizationId, contactObjectIds);
      const contactsById = new Map(contacts.map((c) => [c._id.toString(), c]));

      return toDealReadModel(updated, contactsById.get(updated.contactId.toString()), contactsById);
    });
  }

  /**
   * PATCH /deals/:dealId/reassign. client.reassign — отдельный action от
   * deal.edit, тот же принцип, что уже применён к Task (task.reassign
   * отделён от task.edit, см. reassignTask докстринг). До этого коммита
   * client.reassign был "мёртвым" grant'ом в DEFAULT_ROLE_GRANTS
   * (owner/director/rop, scope 'organization') — ownerPositionId менялся
   * ТОЛЬКО через deal.edit (UpdateDealDto.ownerPositionId), без проверки
   * client.reassign вообще. Для шести встроенных ролей это не давало
   * реальной дыры (deal.edit organization-scope уже есть у тех же
   * owner/director/rop, а own-scope у manager был явно заблокирован
   * сверкой ownerPositionId с собственной позицией в DealController), но
   * платформа поддерживает explicit per-Position custom grant-наборы
   * (⚙-toggle, см. DEFAULT_ROLE_GRANTS докстринг) — Position с deal.edit,
   * но БЕЗ client.reassign, могла бы переназначить владельца сделки в
   * обход зафиксированного в grants намерения. Честный gap, найденный
   * сверкой grants-таблицы с реальными @RequirePermission-проверками, не
   * документа.
   *
   * ownerPositionId у Deal — ОБЯЗАТЕЛЬНОЕ поле (в отличие от
   * Task.assignedPositionId) — reassignDeal не поддерживает "снять
   * владельца", только замену на другую existing assignable позицию той
   * же организации.
   *
   * No-op (ownerPositionId совпадает с текущим) — короткий выход ДО
   * транзакции без проверки версии, тот же принцип, что
   * CrmService.reassignTask: "переназначение" фактически не произошло,
   * нечего фиксировать как факт изменения.
   */
  async reassignDeal(params: {
    dealId: Types.ObjectId;
    organizationId: Types.ObjectId;
    requiredScopePositionId?: Types.ObjectId;
    expectedVersion: number;
    ownerPositionId: Types.ObjectId;
    actorPositionId: Types.ObjectId;
    actorIdentityId: Types.ObjectId;
    correlationId: string;
  }): Promise<CrmDealReadModel> {
    const existing = await this.dealRepository.findByIdForOrganization(
      params.dealId,
      params.organizationId,
      params.requiredScopePositionId,
    );
    if (!existing) {
      throw new NotFoundException('Deal not found');
    }

    if (existing.ownerPositionId.equals(params.ownerPositionId)) {
      const contacts = await this.contactRepository.findByIdsForOrganization(params.organizationId, [
        existing.contactId,
        ...existing.participants.map((p) => p.contactId),
      ]);
      const contactsById = new Map(contacts.map((c) => [c._id.toString(), c]));
      return toDealReadModel(existing, contactsById.get(existing.contactId.toString()), contactsById);
    }

    return runInTransaction(this.connection, async (session) => {
      await this.organizationsService.findAssignablePosition(
        params.ownerPositionId,
        params.organizationId,
        session,
      );

      const { modifiedCount } = await this.dealRepository.reassignOwner(
        params.dealId,
        params.organizationId,
        params.expectedVersion,
        params.ownerPositionId,
        session,
      );
      if (modifiedCount === 0) {
        const current = await this.dealRepository.findByIdForOrganization(
          params.dealId,
          params.organizationId,
          params.requiredScopePositionId,
        );
        if (!current) {
          throw new NotFoundException('Deal not found');
        }
        throw new ConflictException('Deal was modified by another request — refresh and retry');
      }

      const updated = await this.dealRepository.findByIdForOrganization(
        params.dealId,
        params.organizationId,
        undefined,
        session,
      );

      await this.auditService.append(
        {
          actor: { type: 'identity', id: params.actorIdentityId },
          action: 'client.reassign',
          resource: 'deal',
          resourceId: params.dealId,
          before: { ownerPositionId: existing.ownerPositionId.toString() },
          after: { ownerPositionId: params.ownerPositionId.toString() },
          correlationId: params.correlationId,
        },
        session,
      );

      const contactIdSet = new Set<string>([updated!.contactId.toString()]);
      for (const p of updated!.participants ?? []) {
        contactIdSet.add(p.contactId.toString());
      }
      const contactObjectIds = [...contactIdSet].map((id) => new Types.ObjectId(id));
      const contacts = await this.contactRepository.findByIdsForOrganization(params.organizationId, contactObjectIds);
      const contactsById = new Map(contacts.map((c) => [c._id.toString(), c]));

      return toDealReadModel(updated!, contactsById.get(updated!.contactId.toString()), contactsById);
    });
  }

  async changeDealStage(params: {
    dealId: Types.ObjectId;
    organizationId: Types.ObjectId;
    requiredOwnerPositionId?: Types.ObjectId;
    newStage: DealStage;
    expectedVersion: number;
    reason?: string;
    actorPositionId: Types.ObjectId;
    actorIdentityId: Types.ObjectId;
    correlationId: string;
  }): Promise<CrmDealReadModel> {
    const deal = await this.dealRepository.findByIdForOrganization(
      params.dealId,
      params.organizationId,
      params.requiredOwnerPositionId,
    );
    if (!deal) {
      throw new NotFoundException('Deal not found');
    }

    if ((deal.version ?? 0) !== params.expectedVersion) {
      throw new ConflictException('Deal was modified by another request — refresh and retry');
    }

    const previousStage = deal.stage;
    const allowedFromStages = DEAL_STAGE_TRANSITIONS[previousStage];
    if (!allowedFromStages.includes(params.newStage)) {
      throw new AppException(
        ErrorCode.VALIDATION_FAILED,
        `Cannot transition deal stage from "${previousStage}" to "${params.newStage}"`,
        { from: previousStage, to: params.newStage },
      );
    }

    return runInTransaction(this.connection, async (session) => {
      const { modifiedCount } = await this.dealRepository.changeStageWithVersionCheck(
        deal._id,
        params.organizationId,
        params.expectedVersion,
        params.newStage,
        [previousStage],
        session,
      );
      if (modifiedCount === 0) {
        const current = await this.dealRepository.findByIdForOrganization(
          params.dealId,
          params.organizationId,
          params.requiredOwnerPositionId,
        );
        if (!current) {
          throw new NotFoundException('Deal not found');
        }
        throw new ConflictException('Deal was modified by another request — refresh and retry');
      }

      await this.dealEventRepository.append(
        {
          dealId: deal._id,
          organizationId: params.organizationId,
          stage: params.newStage,
          fromStage: previousStage,
          reason: params.reason,
          changedBy: { type: 'position', positionId: params.actorPositionId },
        },
        session,
      );

      await this.auditService.append(
        {
          actor: { type: 'identity', id: params.actorIdentityId },
          action: 'deal.change_stage',
          resource: 'deal',
          resourceId: deal._id,
          before: { stage: previousStage, version: params.expectedVersion },
          after: { stage: params.newStage, version: params.expectedVersion + 1, reason: params.reason ?? null },
          correlationId: params.correlationId,
        },
        session,
      );

      const updated = await this.dealRepository.findByIdForOrganization(
        params.dealId,
        params.organizationId,
        params.requiredOwnerPositionId,
        session,
      );
      if (!updated) {
        throw new NotFoundException('Deal not found');
      }

      const contactIdSet = new Set<string>([updated.contactId.toString()]);
      for (const p of updated.participants ?? []) {
        contactIdSet.add(p.contactId.toString());
      }
      const contactObjectIds = [...contactIdSet].map((id) => new Types.ObjectId(id));
      const contacts = await this.contactRepository.findByIdsForOrganization(params.organizationId, contactObjectIds);
      const contactsById = new Map(contacts.map((c) => [c._id.toString(), c]));

      return toDealReadModel(updated, contactsById.get(updated.contactId.toString()), contactsById);
    });
  }

  async addDealParticipant(params: {
    dealId: Types.ObjectId;
    organizationId: Types.ObjectId;
    requiredOwnerPositionId?: Types.ObjectId;
    contactId: Types.ObjectId;
    role: string;
    expectedVersion: number;
    actorPositionId: Types.ObjectId;
    actorIdentityId: Types.ObjectId;
    correlationId: string;
  }): Promise<CrmDealReadModel> {
    const deal = await this.dealRepository.findByIdForOrganization(
      params.dealId,
      params.organizationId,
      params.requiredOwnerPositionId,
    );
    if (!deal) {
      throw new NotFoundException('Deal not found');
    }
    if ((deal.version ?? 0) !== params.expectedVersion) {
      throw new ConflictException('Deal was modified by another request — refresh and retry');
    }

    const participantContact = await this.contactRepository.findByIdForOrganization(
      params.contactId,
      params.organizationId,
    );
    if (!participantContact) {
      throw new NotFoundException('Contact not found');
    }

    if (deal.participants?.some((p) => p.contactId.equals(params.contactId))) {
      throw new ConflictException('Contact is already a participant in this deal');
    }

    return runInTransaction(this.connection, async (session) => {
      const updated = await this.dealRepository.addParticipant(
        deal._id,
        params.organizationId,
        params.expectedVersion,
        { role: params.role, contactId: params.contactId },
        session,
      );
      if (!updated) {
        const current = await this.dealRepository.findByIdForOrganization(
          params.dealId,
          params.organizationId,
          params.requiredOwnerPositionId,
        );
        if (!current) {
          throw new NotFoundException('Deal not found');
        }
        throw new ConflictException('Deal was modified by another request — refresh and retry');
      }

      await this.auditService.append(
        {
          actor: { type: 'identity', id: params.actorIdentityId },
          action: 'deal.participant_add',
          resource: 'deal',
          resourceId: deal._id,
          after: {
            role: params.role,
            contactId: params.contactId.toString(),
            version: updated.version,
          },
          correlationId: params.correlationId,
        },
        session,
      );

      const contactIdSet = new Set<string>([updated.contactId.toString()]);
      for (const p of updated.participants ?? []) {
        contactIdSet.add(p.contactId.toString());
      }
      const contactObjectIds = [...contactIdSet].map((id) => new Types.ObjectId(id));
      const contacts = await this.contactRepository.findByIdsForOrganization(params.organizationId, contactObjectIds);
      const contactsById = new Map(contacts.map((c) => [c._id.toString(), c]));

      return toDealReadModel(updated, contactsById.get(updated.contactId.toString()), contactsById);
    });
  }

  async removeDealParticipant(params: {
    dealId: Types.ObjectId;
    organizationId: Types.ObjectId;
    requiredOwnerPositionId?: Types.ObjectId;
    contactId: Types.ObjectId;
    expectedVersion: number;
    actorPositionId: Types.ObjectId;
    actorIdentityId: Types.ObjectId;
    correlationId: string;
  }): Promise<CrmDealReadModel> {
    const deal = await this.dealRepository.findByIdForOrganization(
      params.dealId,
      params.organizationId,
      params.requiredOwnerPositionId,
    );
    if (!deal) {
      throw new NotFoundException('Deal not found');
    }
    if ((deal.version ?? 0) !== params.expectedVersion) {
      throw new ConflictException('Deal was modified by another request — refresh and retry');
    }

    if (!deal.participants?.some((p) => p.contactId.equals(params.contactId))) {
      throw new NotFoundException('Participant not found in deal');
    }

    return runInTransaction(this.connection, async (session) => {
      const updated = await this.dealRepository.removeParticipant(
        deal._id,
        params.organizationId,
        params.expectedVersion,
        params.contactId,
        session,
      );
      if (!updated) {
        const current = await this.dealRepository.findByIdForOrganization(
          params.dealId,
          params.organizationId,
          params.requiredOwnerPositionId,
        );
        if (!current) {
          throw new NotFoundException('Deal not found');
        }
        throw new ConflictException('Deal was modified by another request — refresh and retry');
      }

      await this.auditService.append(
        {
          actor: { type: 'identity', id: params.actorIdentityId },
          action: 'deal.participant_remove',
          resource: 'deal',
          resourceId: deal._id,
          after: {
            contactId: params.contactId.toString(),
            version: updated.version,
          },
          correlationId: params.correlationId,
        },
        session,
      );

      const contactIdSet = new Set<string>([updated.contactId.toString()]);
      for (const p of updated.participants ?? []) {
        contactIdSet.add(p.contactId.toString());
      }
      const contactObjectIds = [...contactIdSet].map((id) => new Types.ObjectId(id));
      const contacts = await this.contactRepository.findByIdsForOrganization(params.organizationId, contactObjectIds);
      const contactsById = new Map(contacts.map((c) => [c._id.toString(), c]));

      return toDealReadModel(updated, contactsById.get(updated.contactId.toString()), contactsById);
    });
  }

  async updateDealChecklist(params: {
    dealId: Types.ObjectId;
    organizationId: Types.ObjectId;
    requiredOwnerPositionId?: Types.ObjectId;
    items: Array<{ id?: string; label: string; done: boolean }>;
    expectedVersion: number;
    actorPositionId: Types.ObjectId;
    actorIdentityId: Types.ObjectId;
    correlationId: string;
  }): Promise<CrmDealReadModel> {
    const deal = await this.dealRepository.findByIdForOrganization(
      params.dealId,
      params.organizationId,
      params.requiredOwnerPositionId,
    );
    if (!deal) {
      throw new NotFoundException('Deal not found');
    }
    if ((deal.version ?? 0) !== params.expectedVersion) {
      throw new ConflictException('Deal was modified by another request — refresh and retry');
    }

    const existingMap = new Map<string, DealChecklistItem>(
      (deal.checklistItems ?? []).map((item) => [item.id, item]),
    );

    const mergedItems: DealChecklistItem[] = params.items.map((item) => {
      const existingItem = item.id ? existingMap.get(item.id) : undefined;
      const id = item.id || randomUUID();
      const done = item.done;
      let completedAt: Date | undefined;
      let completedByPositionId: Types.ObjectId | undefined;

      if (done) {
        if (existingItem?.done) {
          completedAt = existingItem.completedAt ?? new Date();
          completedByPositionId = existingItem.completedByPositionId ?? params.actorPositionId;
        } else {
          completedAt = new Date();
          completedByPositionId = params.actorPositionId;
        }
      } else {
        completedAt = undefined;
        completedByPositionId = undefined;
      }

      return {
        id,
        label: item.label,
        done,
        completedAt,
        completedByPositionId,
      };
    });

    return runInTransaction(this.connection, async (session) => {
      const updated = await this.dealRepository.updateChecklist(
        deal._id,
        params.organizationId,
        params.expectedVersion,
        mergedItems,
        session,
      );
      if (!updated) {
        const current = await this.dealRepository.findByIdForOrganization(
          params.dealId,
          params.organizationId,
          params.requiredOwnerPositionId,
        );
        if (!current) {
          throw new NotFoundException('Deal not found');
        }
        throw new ConflictException('Deal was modified by another request — refresh and retry');
      }

      await this.auditService.append(
        {
          actor: { type: 'identity', id: params.actorIdentityId },
          action: 'deal.checklist_update',
          resource: 'deal',
          resourceId: deal._id,
          after: {
            itemsCount: mergedItems.length,
            completedCount: mergedItems.filter((i) => i.done).length,
            version: updated.version,
          },
          correlationId: params.correlationId,
        },
        session,
      );

      const contactIdSet = new Set<string>([updated.contactId.toString()]);
      for (const p of updated.participants ?? []) {
        contactIdSet.add(p.contactId.toString());
      }
      const contactObjectIds = [...contactIdSet].map((id) => new Types.ObjectId(id));
      const contacts = await this.contactRepository.findByIdsForOrganization(params.organizationId, contactObjectIds);
      const contactsById = new Map(contacts.map((c) => [c._id.toString(), c]));

      return toDealReadModel(updated, contactsById.get(updated.contactId.toString()), contactsById);
    });
  }
}

function extractContactChannels(contact: DevelopmentContact): {
  phone: string;
  whatsapp?: string;
  telegram?: string;
} {
  return { phone: contact.phone, whatsapp: contact.whatsapp, telegram: contact.telegram };
}

/**
 * Non-disclosure инвариант reveal-contact (см. crm.service.ts докстринг
 * revealListingContact) — сохранённый idempotency-response обязан содержать
 * ТОЛЬКО {phone, whatsapp?, telegram?, leadId}, никогда organizationId/
 * publisherScope/identityId, даже случайно через spread где-то выше.
 */
function sanitizeRevealResponse(response: RevealContactResult): Record<string, unknown> {
  return {
    phone: response.phone,
    whatsapp: response.whatsapp,
    telegram: response.telegram,
    leadId: response.leadId.toString(),
  };
}

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 11000;
}

/** Сохранённый responseBody хранит leadId как string (JSON-совместимая форма Mongo Object) — reconstruct обратно в ObjectId для единообразного внутреннего типа RevealContactResult. */
function replayToResult(responseBody: Record<string, unknown>): RevealContactResult {
  return {
    phone: responseBody.phone as string,
    whatsapp: responseBody.whatsapp as string | undefined,
    telegram: responseBody.telegram as string | undefined,
    leadId: new Types.ObjectId(responseBody.leadId as string),
  };
}

function toLeadReadModel(
  lead: {
    _id: Types.ObjectId;
    organizationId: Types.ObjectId;
    contactId: Types.ObjectId;
    ownerPositionId?: Types.ObjectId | null;
    stage: LeadStage;
    version?: number;
    source: { route: string; publicationId?: Types.ObjectId; utm?: Record<string, string>; referrer?: string };
    createdAt: Date;
    stalled?: boolean;
  },
  contact: { _id: Types.ObjectId; name: string; phone: string; email?: string } | null | undefined,
  state: { stalled?: boolean; hasOpenNextAction?: boolean } = {},
): CrmLeadReadModel {
  return {
    id: lead._id.toString(),
    organizationId: lead.organizationId.toString(),
    ownerPositionId: lead.ownerPositionId ? lead.ownerPositionId.toString() : null,
    stage: lead.stage,
    version: lead.version ?? 0,
    source: lead.source,
    createdAt: lead.createdAt.toISOString(),
    stalled: state.stalled ?? lead.stalled ?? false,
    contact: contact
      ? { id: contact._id.toString(), name: contact.name, phone: contact.phone, email: contact.email }
      : null,
    hasOpenNextAction: state.hasOpenNextAction ?? false,
  };
}

/** CRM-003: см. ACTIVE_LEAD_STAGES докстринг — converted/lost исключены из "активный лид без next action". */
function isActiveLeadStage(stage: LeadStage): boolean {
  return ACTIVE_LEAD_STAGES.includes(stage);
}

function toLeadEventReadModel(event: {
  _id: Types.ObjectId;
  leadId: Types.ObjectId;
  stage: LeadStage;
  changedBy: { type: 'position' | 'system'; positionId?: Types.ObjectId };
  changedAt: Date;
}): CrmLeadEventReadModel {
  return {
    id: event._id.toString(),
    leadId: event.leadId.toString(),
    stage: event.stage,
    changedBy: {
      type: event.changedBy.type,
      positionId: event.changedBy.positionId?.toString(),
    },
    changedAt: event.changedAt.toISOString(),
  };
}

function toContactReadModel(contact: {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  name: string;
  phone: string;
  email?: string;
  createdAt: Date;
}): CrmContactReadModel {
  return {
    id: contact._id.toString(),
    organizationId: contact.organizationId.toString(),
    name: contact.name,
    phone: contact.phone,
    email: contact.email ?? null,
    createdAt: contact.createdAt.toISOString(),
  };
}

/** Экранирует regex-метасимволы в пользовательском вводе перед сборкой $regex — сырой `q` никогда не подставляется в RegExp() как есть (ReDoS/injection). */
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function toTaskReadModel(task: TaskDocument): CrmTaskReadModel {
  return {
    id: task._id.toString(),
    organizationId: task.organizationId.toString(),
    title: task.title,
    description: task.description ?? null,
    status: task.status,
    dueAt: task.dueAt ? task.dueAt.toISOString() : null,
    assignedPositionId: task.assignedPositionId ? task.assignedPositionId.toString() : null,
    leadId: task.leadId ? task.leadId.toString() : null,
    contactId: task.contactId ? task.contactId.toString() : null,
    completedAt: task.completedAt ? task.completedAt.toISOString() : null,
    completedByPositionId: task.completedByPositionId ? task.completedByPositionId.toString() : null,
    createdByPositionId: task.createdByPositionId ? task.createdByPositionId.toString() : null,
    version: task.version ?? 0,
    createdAt: task.createdAt ? task.createdAt.toISOString() : new Date().toISOString(),
    updatedAt: task.updatedAt ? task.updatedAt.toISOString() : null,

    startAt: task.startAt ? task.startAt.toISOString() : null,
    isUrgent: Boolean(task.isUrgent),
    isImportant: task.isImportant ?? true,
    priority: priorityFromFlags(Boolean(task.isUrgent), task.isImportant ?? true),
    taskCategory: task.taskCategory ?? 'work',
    colorHex: task.colorHex ?? null,
    reminderOffsetsMinutes: task.reminderOffsetsMinutes ?? [],
    subtasks: (task.subtasks ?? []).map((item) => ({
      id: item.id,
      title: item.title,
      done: Boolean(item.done),
    })),
    attachmentFileNames: task.attachmentFileNames ?? [],
    // Связь выводится из хранимых ссылок, как isOverdue из dueAt: одна правда.
    entityType: task.leadId ? 'lead' : task.contactId ? 'client' : 'none',
    entityId: task.leadId ? task.leadId.toString() : task.contactId ? task.contactId.toString() : null,
    isAutomatic: Boolean(task.isAutomatic),
    triggerType: task.triggerType ?? null,
    // Открытая или взятая в работу задача со сроком в прошлом — просрочена.
    // Завершённая и отменённая просроченными не считаются никогда.
    isOverdue:
      (task.status === 'open' || task.status === 'in_progress') &&
      Boolean(task.dueAt) &&
      task.dueAt!.getTime() < Date.now(),
  };
}

/**
 * CRM-004: минимальный, безопасный payload, общий для TaskCreated/
 * TaskCompleted/TaskReassigned (последнее добавляет previous/new
 * assignedPositionId поверх этого набора отдельно в reassignTask, т.к.
 * этот сдвиг не имеет смысла для двух других событий). НАМЕРЕННО не
 * включает title/description (потенциально содержат PII/бизнес-детали,
 * consumer не для этого — таск требует "минимальный и безопасный payload:
 * taskId, organizationId, leadId/contactId, previous/new assignee только
 * для reassign, actorPositionId, occurredAt/correlationId"), не
 * телефон/email контакта (contactId — ссылка, не денормализация), не
 * весь Mongo-документ и не сырое audit-тело.
 */
function taskEventPayload(
  task: { _id: Types.ObjectId; organizationId: Types.ObjectId; leadId?: Types.ObjectId; contactId?: Types.ObjectId; assignedPositionId?: Types.ObjectId },
  context: { actorPositionId: Types.ObjectId; correlationId: string },
): Record<string, unknown> {
  return {
    taskId: task._id.toString(),
    organizationId: task.organizationId.toString(),
    leadId: task.leadId?.toString() ?? null,
    contactId: task.contactId?.toString() ?? null,
    assignedPositionId: task.assignedPositionId?.toString() ?? null,
    actorPositionId: context.actorPositionId.toString(),
    occurredAt: new Date().toISOString(),
    correlationId: context.correlationId,
  };
}

function toDealReadModel(
  deal: DealDocument,
  primaryContact?: { _id: Types.ObjectId; name: string; phone: string; email?: string } | null,
  contactsById?: Map<string, { _id: Types.ObjectId; name: string; phone: string; email?: string }>,
): CrmDealReadModel {
  return {
    id: deal._id.toString(),
    organizationId: deal.organizationId.toString(),
    leadId: deal.leadId ? deal.leadId.toString() : null,
    contactId: deal.contactId.toString(),
    ownerPositionId: deal.ownerPositionId.toString(),
    title: deal.title,
    description: deal.description ?? null,
    stage: deal.stage,
    expectedCommission: deal.expectedCommission
      ? {
          amountMinorUnits: deal.expectedCommission.amountMinorUnits,
          currency: deal.expectedCommission.currency,
        }
      : null,
    participants: (deal.participants ?? []).map((p) => {
      const c = contactsById?.get(p.contactId.toString());
      return {
        role: p.role,
        contactId: p.contactId.toString(),
        contact: c
          ? {
              id: c._id.toString(),
              name: c.name,
              phone: c.phone,
              email: c.email,
            }
          : null,
      };
    }),
    checklistItems: (deal.checklistItems ?? []).map((item) => ({
      id: item.id,
      label: item.label,
      done: item.done ?? false,
      completedAt: item.completedAt ? item.completedAt.toISOString() : null,
      completedByPositionId: item.completedByPositionId ? item.completedByPositionId.toString() : null,
    })),
    version: deal.version ?? 0,
    createdAt: deal.createdAt ? deal.createdAt.toISOString() : new Date().toISOString(),
    updatedAt: deal.updatedAt ? deal.updatedAt.toISOString() : new Date().toISOString(),
    contact: primaryContact
      ? {
          id: primaryContact._id.toString(),
          name: primaryContact.name,
          phone: primaryContact.phone,
          email: primaryContact.email,
        }
      : null,
  };
}

function encodeTimelineCursor(happenedAt: string, id: string): string {
  return Buffer.from(`${happenedAt}|${id}`, 'utf8').toString('base64url');
}

function decodeTimelineCursor(cursor: string): { happenedAt: string; id: string } | null {
  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    const separatorIndex = decoded.indexOf('|');
    if (separatorIndex === -1) return null;
    const happenedAt = decoded.slice(0, separatorIndex);
    const id = decoded.slice(separatorIndex + 1);
    if (!happenedAt || !id) return null;
    return { happenedAt, id };
  } catch {
    return null;
  }
}

function paginateTimelineEvents(
  items: CrmTimelineEventReadModel[],
  params: {
    type?: TimelineEventType;
    from?: string;
    to?: string;
    cursor?: string;
    limit: number;
  },
): { items: CrmTimelineEventReadModel[]; nextCursor: string | null } {
  let filtered = items;

  if (params.type) {
    filtered = filtered.filter((item) => item.type === params.type);
  }
  if (params.from) {
    filtered = filtered.filter((item) => item.happenedAt >= params.from!);
  }
  if (params.to) {
    filtered = filtered.filter((item) => item.happenedAt <= params.to!);
  }

  filtered.sort((a, b) => {
    if (a.happenedAt !== b.happenedAt) {
      return b.happenedAt.localeCompare(a.happenedAt);
    }
    return b.id.localeCompare(a.id);
  });

  if (params.cursor) {
    const cursor = decodeTimelineCursor(params.cursor);
    if (cursor) {
      filtered = filtered.filter((item) => {
        if (item.happenedAt < cursor.happenedAt) return true;
        if (item.happenedAt === cursor.happenedAt && item.id < cursor.id) return true;
        return false;
      });
    }
  }

  const hasMore = filtered.length > params.limit;
  const pageItems = hasMore ? filtered.slice(0, params.limit) : filtered;
  const nextCursor =
    hasMore && pageItems.length > 0
      ? encodeTimelineCursor(pageItems[pageItems.length - 1]!.happenedAt, pageItems[pageItems.length - 1]!.id)
      : null;

  return { items: pageItems, nextCursor };
}
