import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { randomBytes, createHash } from 'node:crypto';
import { Connection, Types } from 'mongoose';
import { runInTransaction } from '../../shared/transactions/run-in-transaction';
import { OrganizationRepository } from './repository/organization.repository';
import { PositionRepository } from './repository/position.repository';
import { PositionAssignmentRepository } from './repository/position-assignment.repository';
import { InvitationRepository } from './repository/invitation.repository';
import { SessionService } from '../identity/session.service';
import { AuthService } from '../identity/auth.service';
import { AuditService } from '../audit/audit.service';
import { OutboxService } from '../outbox/outbox.service';
import { PolicyEvaluatorService } from '../authorization/policy-evaluator.service';
import { AppException } from '../../shared/errors/app-exception';
import { ErrorCode } from '../../shared/errors/error-codes';
import { DEFAULT_ROLE_GRANTS } from './default-role-grants';
import type { OrganizationType } from './schemas/organization.schema';
import type { FixedRole } from './schemas/position.schema';
import type { PermissionScope } from '../authorization/schemas/permission-grant.schema';

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Транзакционный command-слой Organizations/Positions/Assignments (ADR-003, C-06).
 * Каждая команда, меняющая более одного документа, выполняется в единой
 * MongoDB-транзакции (ADR-006) — не последовательными независимыми записями.
 */
@Injectable()
export class OrganizationsService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly organizationRepository: OrganizationRepository,
    private readonly positionRepository: PositionRepository,
    private readonly positionAssignmentRepository: PositionAssignmentRepository,
    private readonly invitationRepository: InvitationRepository,
    private readonly sessionService: SessionService,
    private readonly authService: AuthService,
    private readonly auditService: AuditService,
    private readonly outboxService: OutboxService,
    private readonly policyEvaluator: PolicyEvaluatorService,
  ) {}

  /**
   * permission-matrix.md разд.1: "Роль на Position задаёт СТАРТОВЫЙ набор
   * grants при создании позиции" — найдено реальным E2E-прогоном (не
   * гипотетически), что без этого вызова ни один PermissionGrant никогда
   * не создавался ни для одной Position, deny-by-default PolicyEvaluatorService
   * отклонял ЛЮБОЙ authenticated ERP-запрос даже для владельца организации.
   * ПОСЛЕ коммита транзакции создания Position — тот же принцип, что уже
   * применён к grantErpAccess (permission_grants — коллекция authorization-
   * модуля, ADR-001 модульная граница; риск временного рассинхрона
   * безопаснее в сторону недодоступа, не сверхдоступа).
   */
  private async grantDefaultRolePermissions(positionId: Types.ObjectId, fixedRole: FixedRole): Promise<void> {
    const defaults = DEFAULT_ROLE_GRANTS[fixedRole];
    // grantMany — один insertMany вместо N последовательных round-trips
    // (second-opinion ревью: до 21 записи для owner).
    await this.policyEvaluator.grantMany(
      defaults.map((grant) => ({
        subjectType: 'position' as const,
        subjectId: positionId,
        resource: grant.resource,
        action: grant.action,
        scope: grant.scope,
      })),
    );
  }

  /**
   * Регистрация организации сразу с owner-позицией, занятой создающей
   * identity — типичный onboarding flow (ERP-002 traceability, вопрос
   * open-decisions.md #1: заявка с ручным одобрением для агентства,
   * invite-only для застройщика — approval workflow здесь не входит,
   * это только техническая механика создания org+position+assignment
   * атомарно, командой более высокого уровня оборачивается при
   * реализации approval-очереди на Этапе 8).
   */
  async createOrganizationWithOwner(params: {
    type: OrganizationType;
    name: string;
    ownerIdentityId: Types.ObjectId;
  }): Promise<{ organizationId: Types.ObjectId; positionId: Types.ObjectId }> {
    const result = await runInTransaction(this.connection, async (session) => {
      const organization = await this.organizationRepository.create(
        { type: params.type, name: params.name },
        session,
      );

      const ownerPosition = await this.positionRepository.create(
        { organizationId: organization._id, fixedRole: 'owner' },
        session,
      );

      await this.positionAssignmentRepository.createAssignment(
        {
          identityId: params.ownerIdentityId,
          positionId: ownerPosition._id,
          organizationId: organization._id,
        },
        session,
      );

      await this.positionRepository.markOccupied(ownerPosition._id, 'Owner', session);

      return { organizationId: organization._id, positionId: ownerPosition._id };
    });

    // ADR-003/ADR-004: тот же принцип, что assignOccupant ниже — owner
    // сразу занимает позицию при регистрации организации (минуя
    // assignOccupant), значит должен получить ProductAccess('erp') тем же
    // путём, иначе не сможет залогиниться в собственный только что
    // созданный ERP.
    await this.authService.grantErpAccess(params.ownerIdentityId);
    await this.grantDefaultRolePermissions(result.positionId, 'owner');

    return result;
  }

  /**
   * Создание вакантной позиции внутри уже существующей организации
   * (permission-matrix.md 1.4: position.create.organization — owner/director,
   * ⚙ administrator).
   */
  async createVacantPosition(params: {
    organizationId: Types.ObjectId;
    fixedRole: FixedRole;
    parentPositionId?: Types.ObjectId;
  }): Promise<Types.ObjectId> {
    const position = await this.positionRepository.create(params);
    await this.grantDefaultRolePermissions(position._id, params.fixedRole);
    return position._id;
  }

  /**
   * permission-matrix.md 1.4 `personal_access.grant.position` (owner/
   * director) — explicit per-position ⚙-toggle grant поверх стартового
   * default-набора (owner decision xlsx #53: manager unit.price.update
   * "тумблер"; xlsx #24: administrator position.*). НЕ bulk-замена всего
   * набора — один grant за вызов, тот же принцип, что
   * AdminAccountService.grantPermission (D-06).
   *
   * expectedOrganizationId (ADR-002 требование 1): tenant-escape prevention
   * — позиция должна реально принадлежать организации вызывающего.
   */
  async grantPositionPermission(params: {
    positionId: Types.ObjectId;
    expectedOrganizationId: Types.ObjectId;
    resource: string;
    action: string;
    scope: PermissionScope;
    scopeValue?: string;
  }): Promise<void> {
    const position = await this.positionRepository.findByIdForOrganization(
      params.positionId,
      params.expectedOrganizationId,
    );
    if (!position) {
      throw new NotFoundException('Position not found');
    }

    await this.policyEvaluator.grant({
      subjectType: 'position',
      subjectId: params.positionId,
      resource: params.resource,
      action: params.action,
      scope: params.scope,
      scopeValue: params.scopeValue,
    });
  }

  /**
   * assignOccupant (ADR-003): занимает вакантную позицию конкретной identity.
   * Транзакционно: создание PositionAssignment + пометка Position occupied +
   * audit-запись + outbox-событие PositionOccupantAssigned — всё в одной
   * MongoDB-транзакции (ADR-006). Partial unique index (ADR-003) физически
   * предотвращает занятие уже занятой позиции или второе назначение той же
   * identity — конфликт всплывает как ConflictException из
   * PositionAssignmentRepository, транзакция откатывается целиком (включая
   * audit/outbox записи — они не "утекают" при откате).
   *
   * permission-matrix.md 1.4: position.assign_occupant.organization —
   * critical action (раздел 4) → audit обязателен, не опционален.
   *
   * expectedOrganizationId (ADR-002 требование 1, tenant escape prevention):
   * вызывающий код (controller) обязан передать organizationId из
   * VerifiedTenantContext — НЕ из URL/body клиента. Эта проверка — не
   * дублирование controller-проверки URL-параметра, а единственная
   * гарантия, реально привязанная к данным: она сверяет заявленный tenant
   * с organizationId, фактически хранящимся на найденной по positionId
   * записи, а не просто с текстом в адресной строке.
   */
  async assignOccupant(params: {
    positionId: Types.ObjectId;
    identityId: Types.ObjectId;
    occupantDisplayName: string;
    actorIdentityId: Types.ObjectId;
    expectedOrganizationId: Types.ObjectId;
    correlationId: string;
  }): Promise<Types.ObjectId> {
    const assignmentId = await runInTransaction(this.connection, async (session) => {
      // findByIdForOrganization (не findById) — session-aware чтение внутри
      // транзакции, не рассинхронизированное с последующими write в том же
      // session (second-opinion ревью: findById без session — потенциальный
      // stale-read внутри транзакции).
      const position = await this.positionRepository.findByIdForOrganization(
        params.positionId,
        params.expectedOrganizationId,
        session,
      );
      if (!position) {
        // Один и тот же NOT_FOUND для "не существует" и "существует, но в
        // чужой организации" — не раскрываем cross-tenant существование
        // (error-catalog.md: NOT_FOUND, тот же паттерн, что и controller-
        // проверка URL-параметра выше).
        throw new NotFoundException('Position not found');
      }
      if (position.status !== 'vacant') {
        // Second-opinion ревью нашло реальный пробел: без этой проверки
        // closed-позицию можно было "воскресить" назначением occupant'а —
        // partial unique index на positionId защищает только от повторного
        // занятия УЖЕ occupied позиции (createAssignment ниже упал бы
        // ConflictException), но closed не имеет активного assignment,
        // поэтому индекс её не защищает.
        throw new ConflictException('Position is not vacant');
      }

      const identityExists = (await this.authService.findByIds([params.identityId])).length > 0;
      if (!identityExists) {
        throw new NotFoundException('Identity not found');
      }

      const assignment = await this.positionAssignmentRepository.createAssignment(
        {
          identityId: params.identityId,
          positionId: params.positionId,
          organizationId: position.organizationId,
        },
        session,
      );

      await this.positionRepository.markOccupied(params.positionId, params.occupantDisplayName, session);

      await this.auditService.append(
        {
          actor: { type: 'identity', id: params.actorIdentityId },
          action: 'position.assign_occupant',
          resource: 'position_assignment',
          resourceId: assignment._id,
          after: {
            positionId: params.positionId.toString(),
            identityId: params.identityId.toString(),
            organizationId: position.organizationId.toString(),
          },
          correlationId: params.correlationId,
        },
        session,
      );

      await this.outboxService.publish(
        {
          eventType: 'PositionOccupantAssigned',
          aggregateType: 'position',
          aggregateId: params.positionId,
          payload: {
            assignmentId: assignment._id.toString(),
            identityId: params.identityId.toString(),
            organizationId: position.organizationId.toString(),
          },
          // Явный ключ: одна и та же позиция может занимать/освобождаться
          // многократно за время жизни системы — deduplicationKey должен
          // включать assignmentId, иначе второе занятие той же позиции
          // (после vacate) молча схлопнется с первым событием по умолчательному
          // ключу `position:{positionId}:PositionOccupantAssigned`.
          deduplicationKey: `position_assignment:${assignment._id.toString()}:PositionOccupantAssigned`,
        },
        session,
      );

      return assignment._id;
    });

    // ADR-003/ADR-004: "создание позиции автоматически подразумевает
    // ProductAccess к ERP для этой identity" — ПОСЛЕ коммита транзакции,
    // не внутри неё. Тот же принцип модульных границ, что уже применён
    // ниже к revokeAllErpSessions в vacatePosition (см. её комментарий):
    // product_accesses — коллекция Identity-модуля, не Organizations,
    // смешивать запись в чужую коллекцию внутри этой транзакции нарушало
    // бы ADR-001. Здесь риск временного рассинхрона даже безопаснее, чем
    // у revoke: если grantErpAccess упадёт после успешного assignOccupant,
    // человек просто ещё на несколько мгновений не сможет залогиниться в
    // ERP — не "получит доступ, которого не должно быть".
    await this.authService.grantErpAccess(params.identityId);

    return assignmentId;
  }

  /**
   * teamApi.ts::assignOccupant(positionId, {name, email, loginEmail, phone?,
   * telegram?}) — email-based invite-flow, обёртка над уже существующим
   * assignOccupant(identityId), не дублирует его транзакционную логику.
   * Two-phase: (1) резолвит email в identityId ВНЕ транзакции через
   * AuthService.findOrCreatePendingIdentity (создание Identity — коллекция
   * Identity-модуля, ADR-001 модульная граница, тот же принцип, что
   * grantErpAccess ПОСЛЕ коммита в других командах этого файла — здесь
   * ДО, потому что assignOccupant ниже требует уже существующий
   * identityId как обязательный параметр); (2) делегирует assignOccupant,
   * которая делает саму transactional работу (assignment+audit+outbox).
   *
   * Для НОВОЙ identity (isNew:true) — создаёт Invitation с одноразовым
   * токеном (TTL 7 дней) ПОСЛЕ успешного assignOccupant — приглашённый
   * получает доступ к позиции сразу (assignOccupant уже выполнил grantErpAccess),
   * но залогиниться не может, пока не поставит пароль через
   * POST /invite/:token/activate (login() отклоняет pending_invite Identity
   * явно, см. auth.service.ts).
   */
  async assignOccupantByEmail(params: {
    positionId: Types.ObjectId;
    name: string;
    email: string;
    loginEmail: string;
    actorIdentityId: Types.ObjectId;
    expectedOrganizationId: Types.ObjectId;
    correlationId: string;
  }): Promise<{ assignmentId: Types.ObjectId; linkedExisting: boolean; inviteToken: string | null; inviteTokenExpiresAt: Date | null }> {
    const { identityId, isNew } = await this.authService.findOrCreatePendingIdentity(params.loginEmail);

    const assignmentId = await this.assignOccupant({
      positionId: params.positionId,
      identityId,
      occupantDisplayName: params.name,
      actorIdentityId: params.actorIdentityId,
      expectedOrganizationId: params.expectedOrganizationId,
      correlationId: params.correlationId,
    });

    if (!isNew) {
      return { assignmentId, linkedExisting: true, inviteToken: null, inviteTokenExpiresAt: null };
    }

    // Сырой токен — только в ответе клиенту (менеджер копирует ссылку) и в
    // теле письма/чата, никогда не в БД (та же причина, что sessionToken/
    // hashed cookie-паттерн в SessionService) — hash сравнивается на
    // activate, не сырой токен.
    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);

    await this.invitationRepository.create({
      organizationId: params.expectedOrganizationId,
      positionId: params.positionId,
      identityId,
      tokenHash,
      email: params.email,
      expiresAt,
    });

    return { assignmentId, linkedExisting: false, inviteToken: rawToken, inviteTokenExpiresAt: expiresAt };
  }

  /**
   * POST /invite/:token/activate (публичный, InvitationController) —
   * приглашённый ставит себе пароль впервые. Единый ошибочный код
   * (410 GONE через AppException) для "не найден"/"уже активирован"/
   * "истёк" — не раскрываем гостю, какой из трёх случаев произошёл (тот же
   * non-disclosure принцип, что везде в auth-модуле), кроме единственного
   * различимого случая, где раскрытие безопасно и полезно клиенту
   * (истёкший токен — тот же UI-текст "ссылка недействительна", что и
   * прочие случаи, так что различение здесь не требуется вызывающему коду
   * фронтенда — activateInvite() возвращает только {activated, email}).
   */
  async activateInvitation(rawToken: string, password: string): Promise<{ email: string }> {
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const invitation = await this.invitationRepository.findByTokenHash(tokenHash);

    if (!invitation || invitation.status !== 'pending' || invitation.expiresAt.getTime() < Date.now()) {
      throw new AppException(ErrorCode.NOT_FOUND, 'Invitation link is invalid or has expired');
    }

    const { activated } = await this.authService.activatePendingIdentity(invitation.identityId, password);
    if (!activated) {
      // Гонка: другой запрос активировал ту же Identity между проверкой
      // invitation.status выше и этим вызовом — тот же класс TOCTOU, что
      // endAssignment/updateParent в этом файле.
      throw new AppException(ErrorCode.NOT_FOUND, 'Invitation link is invalid or has expired');
    }

    await this.invitationRepository.markActivated(invitation._id);

    return { email: invitation.email };
  }

  /**
   * vacatePosition (ADR-003): закрывает assignment, освобождает позицию,
   * немедленно отзывает все ERP-сессии этой identity — всё в одной
   * транзакции. Лиды/клиенты/задачи, привязанные к ownerPositionId,
   * НЕ трогаются здесь (они остаются на Position согласно ADR-003 —
   * это прямое следствие модели, не отдельное действие этой команды).
   *
   * audit + outbox (ДОБАВЛЕНО, second-opinion ревью): permission-matrix.md
   * помечает position.vacate.organization как ⚙-критичное действие — тот же
   * статус, что assignOccupant, симметрично которому эти записи были
   * пропущены здесь изначально, не намеренно.
   *
   * Revoke сессий выполняется ВНЕ транзакции (после коммита) — то же
   * решение, что и у assignOccupant/grantErpAccess выше по файлу: sessions —
   * коллекция модуля Identity, а не Organizations, смешивать запись в чужую
   * коллекцию внутри транзакции этого модуля нарушало бы ADR-001 модульные
   * границы. Если revoke здесь упадёт после успешного коммита vacatePosition —
   * assignment уже закрыт корректно, но сессия могла остаться активной
   * короткое время; это приемлемый компромисс между модульной изоляцией и
   * строгой атомарностью, задокументированный явно, не случайный пробел.
   */
  async vacatePosition(params: {
    assignmentId: Types.ObjectId;
    identityId: Types.ObjectId;
    positionId: Types.ObjectId;
    actorIdentityId: Types.ObjectId;
    organizationId: Types.ObjectId;
    correlationId: string;
    handoverNote?: string;
  }): Promise<void> {
    await runInTransaction(this.connection, async (session) => {
      const { matchedCount } = await this.positionAssignmentRepository.endAssignment(
        params.assignmentId,
        params.handoverNote,
        session,
      );
      if (matchedCount === 0) {
        // Конкурентный vacate того же assignment уже завершил его между
        // resolve (vacatePositionByPositionId) и этим вызовом — та же
        // семантика, что ConflictException в других TOCTOU-местах кодовой
        // базы (updatePriceWithVersionCheck и т.п.).
        throw new ConflictException('Assignment already ended');
      }
      await this.positionRepository.markVacant(params.positionId, session);

      await this.auditService.append(
        {
          actor: { type: 'identity', id: params.actorIdentityId },
          action: 'position.vacate',
          resource: 'position_assignment',
          resourceId: params.assignmentId,
          before: { identityId: params.identityId.toString(), positionId: params.positionId.toString() },
          correlationId: params.correlationId,
        },
        session,
      );

      await this.outboxService.publish(
        {
          eventType: 'PositionVacated',
          aggregateType: 'position',
          aggregateId: params.positionId,
          payload: {
            assignmentId: params.assignmentId.toString(),
            identityId: params.identityId.toString(),
            organizationId: params.organizationId.toString(),
          },
          // Тот же принцип, что PositionOccupantAssigned выше: assignmentId
          // в ключе, не только positionId — позиция может освобождаться
          // многократно за время жизни системы.
          deduplicationKey: `position_assignment:${params.assignmentId.toString()}:PositionVacated`,
        },
        session,
      );
    });

    // Revoke сессий — намеренно ПОСЛЕ коммита транзакции, не внутри неё:
    // sessions — коллекция модуля Identity, а не Organizations; смешивать
    // запись в чужую коллекцию внутри транзакции этого модуля нарушало бы
    // ADR-001 модульные границы (общение между модулями через сервисы,
    // не через совместное участие в одной transaction). Если revoke здесь
    // упадёт после успешного коммита vacatePosition — assignment уже закрыт
    // корректно, но сессия могла остаться активной короткое время; это
    // приемлемый компромисс между модульной изоляцией и строгой атомарностью,
    // задокументированный явно, не случайный пробел.
    await this.sessionService.revokeAllErpSessions(params.identityId);
  }

  /**
   * teamApi.ts::vacate(positionId) — HTTP-контракт фронтенда передаёт
   * только positionId (не знает assignmentId/identityId клиентской
   * стороной), в отличие от уже существующего vacatePosition(), который
   * ожидает все три явно. Эта обёртка резолвит недостающие параметры
   * tenant-scoped запросом, затем делегирует уже существующей
   * (протестированной) команде — не дублирует её транзакционную логику.
   */
  async vacatePositionByPositionId(params: {
    positionId: Types.ObjectId;
    expectedOrganizationId: Types.ObjectId;
    actorIdentityId: Types.ObjectId;
    correlationId: string;
    handoverNote?: string;
  }): Promise<void> {
    const position = await this.positionRepository.findByIdForOrganization(
      params.positionId,
      params.expectedOrganizationId,
    );
    if (!position) {
      throw new NotFoundException('Position not found');
    }

    const assignment = await this.positionAssignmentRepository.findActiveByPosition(params.positionId);
    if (!assignment) {
      throw new NotFoundException('No active assignment for this position');
    }

    await this.vacatePosition({
      assignmentId: assignment._id,
      identityId: assignment.identityId,
      actorIdentityId: params.actorIdentityId,
      organizationId: params.expectedOrganizationId,
      correlationId: params.correlationId,
      positionId: params.positionId,
      handoverNote: params.handoverNote,
    });
  }

  /**
   * teamApi.ts::move(id, managerId) — сменить parentPositionId. null
   * допустим явно (top-level позиция). Защита от self-parent (позиция не
   * может быть родителем самой себя) — прямая, не полный graph-cycle
   * detection (позиция A → B → A транзитивно) — за пределами этой узкой
   * задачи, честно не реализовано, зафиксировано в evidence.
   */
  async changePositionParent(params: {
    positionId: Types.ObjectId;
    newParentPositionId: Types.ObjectId | null;
    expectedOrganizationId: Types.ObjectId;
  }): Promise<void> {
    const position = await this.positionRepository.findByIdForOrganization(
      params.positionId,
      params.expectedOrganizationId,
    );
    if (!position) {
      throw new NotFoundException('Position not found');
    }

    if (params.newParentPositionId && params.newParentPositionId.equals(params.positionId)) {
      throw new AppException(ErrorCode.VALIDATION_FAILED, 'Position cannot be its own parent');
    }

    if (params.newParentPositionId) {
      const newParent = await this.positionRepository.findByIdForOrganization(
        params.newParentPositionId,
        params.expectedOrganizationId,
      );
      if (!newParent) {
        throw new NotFoundException('New parent position not found');
      }
    }

    const { matchedCount } = await this.positionRepository.updateParent(
      params.positionId,
      params.newParentPositionId,
    );
    if (matchedCount === 0) {
      throw new NotFoundException('Position not found');
    }
  }

  /**
   * teamApi.ts::remove(id) — Position lifecycle "closed, ТОЛЬКО из vacant"
   * (domain-model.md Module 2). НЕ проверяет и не переносит дочерние
   * позиции (Position.parentPositionId === эта позиция) — если у закрытой
   * позиции остаются "осиротевшие" дочерние записи в оргструктуре, это
   * честно НЕ обработано в этом узком проходе (не запрошено, не входит в
   * scope "удалить пустую позицию").
   */
  async closePosition(params: {
    positionId: Types.ObjectId;
    expectedOrganizationId: Types.ObjectId;
  }): Promise<void> {
    const position = await this.positionRepository.findByIdForOrganization(
      params.positionId,
      params.expectedOrganizationId,
    );
    if (!position) {
      throw new NotFoundException('Position not found');
    }

    if (position.fixedRole === 'owner') {
      // Second-opinion ревью нашло реальный, недокументированный риск:
      // закрытие единственной owner-позиции оставляет организацию без
      // владельца — тупик, поскольку создание новой позиции (position.create.
      // organization) само требует гранта owner/director, которого больше
      // ни у кого нет.
      throw new ConflictException('Owner position cannot be closed');
    }

    const { modifiedCount } = await this.positionRepository.markClosed(params.positionId);
    if (modifiedCount === 0) {
      // Позиция реально существует (только что найдена выше), но не vacant —
      // ConflictException, не NotFoundException (та же семантика, что
      // VERSION_CONFLICT в других optimistic-concurrency местах кодовой
      // базы: запись существует, просто не в том состоянии).
      throw new ConflictException('Only a vacant position can be closed — vacate it first');
    }
  }
}
