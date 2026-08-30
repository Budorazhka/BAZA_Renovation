import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { ClientSession, Connection, Types } from 'mongoose';
import { MarketplacePublicationRepository } from '@baza/publication';
import { DevelopmentRepository, type DevelopmentContact } from '@baza/development';
import { ListingRepository, PropertyAssetRepository } from '@baza/property-assets';
import { AppException } from '../../shared/errors/app-exception';
import { ErrorCode } from '../../shared/errors/error-codes';
import { runInTransaction } from '../../shared/transactions/run-in-transaction';
import { PublicRevealIdempotencyService } from '../../shared/idempotency/public-reveal-idempotency.service';
import { AuditService } from '../audit/audit.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { ContactRepository } from './repository/contact.repository';
import { LeadRepository } from './repository/lead.repository';
import { LeadEventRepository } from './repository/lead-event.repository';
import type { LeadStage } from './schemas/lead.schema';

type RevealContactResult = { phone: string; whatsapp?: string; telegram?: string; leadId: Types.ObjectId };

export interface CrmLeadReadModel {
  id: string;
  organizationId: string;
  ownerPositionId: string | null;
  stage: LeadStage;
  version: number;
  source: { route: string; publicationId?: Types.ObjectId; utm?: Record<string, string>; referrer?: string };
  createdAt: string;
  contact: { id: string; name: string; phone: string; email?: string } | null;
}

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
  ) {}

  /**
   * ERP CRM read-path. ownerPositionId передаётся только для own/assigned
   * grants; organization-wide роли получают undefined и видят весь tenant.
   * Нельзя реализовывать это фильтрацией уже после чтения: repository
   * обязан получить ownerPositionId прямо в Mongo-фильтре.
   */
  async listLeads(params: {
    organizationId: Types.ObjectId;
    ownerPositionId?: Types.ObjectId;
    stage?: LeadStage;
    limit: number;
  }): Promise<{ items: CrmLeadReadModel[] }> {
    const leads = await this.leadRepository.listForOrganization(params.organizationId, {
      ownerPositionId: params.ownerPositionId,
      stage: params.stage,
      limit: params.limit,
    });
    const contactIds = [...new Map(leads.map((lead) => [lead.contactId.toString(), lead.contactId])).values()];
    const contacts = await this.contactRepository.findByIdsForOrganization(params.organizationId, contactIds);
    const contactsById = new Map(contacts.map((contact) => [contact._id.toString(), contact]));

    return { items: leads.map((lead) => toLeadReadModel(lead, contactsById.get(lead.contactId.toString()))) };
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
    return toLeadReadModel(lead, contact);
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
    ownerPositionId?: Types.ObjectId;
    stage: LeadStage;
    version?: number;
    source: { route: string; publicationId?: Types.ObjectId; utm?: Record<string, string>; referrer?: string };
    createdAt: Date;
  },
  contact: { _id: Types.ObjectId; name: string; phone: string; email?: string } | null | undefined,
): CrmLeadReadModel {
  return {
    id: lead._id.toString(),
    organizationId: lead.organizationId.toString(),
    ownerPositionId: lead.ownerPositionId?.toString() ?? null,
    stage: lead.stage,
    version: lead.version ?? 0,
    source: lead.source,
    createdAt: lead.createdAt.toISOString(),
    contact: contact
      ? { id: contact._id.toString(), name: contact.name, phone: contact.phone, email: contact.email }
      : null,
  };
}
