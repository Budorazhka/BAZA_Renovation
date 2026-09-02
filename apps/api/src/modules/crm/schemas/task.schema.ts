import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/**
 * `in_progress` добавлен 02.09.2026: экран задач ERP показывает четыре
 * состояния — «Новая», «В работе», «Выполнена», «Просрочена», — и требование
 * к продукту такое, что интерфейс не меняется, а модель подстраивается под
 * него. Три из четырёх ложатся на хранимые статусы (`open`, `in_progress`,
 * `completed`); «Просрочена» НЕ хранится и не может храниться — это
 * производное от `dueAt < now` при незавершённой задаче, и хранить его
 * значило бы заводить поле, которое устаревает само по себе каждую полночь.
 *
 * `cancelled` собственного отображения на экране пока не имеет — состояние
 * серверное, остаётся как было.
 */
export type TaskStatus = 'open' | 'in_progress' | 'completed' | 'cancelled';

export const TASK_STATUSES: readonly TaskStatus[] = [
  'open',
  'in_progress',
  'completed',
  'cancelled',
] as const;

/** Приоритет задачи — «Не срочно / Важно / Срочно / Срочно и важно» на экране. */
export type TaskPriority = 'low' | 'medium' | 'high' | 'critical';

export const TASK_PRIORITIES: readonly TaskPriority[] = ['low', 'medium', 'high', 'critical'] as const;

/** Рабочая или личная задача — отдельные вкладки реестра. */
export type TaskCategory = 'work' | 'personal';

export const TASK_CATEGORIES: readonly TaskCategory[] = ['work', 'personal'] as const;

/**
 * К чему привязана задача. `none` — самостоятельная задача без объекта, это
 * штатный случай (личные задачи), а не отсутствие данных.
 */
export type TaskEntityType = 'lead' | 'client' | 'deal' | 'property' | 'booking' | 'none';

export const TASK_ENTITY_TYPES: readonly TaskEntityType[] = [
  'lead',
  'client',
  'deal',
  'property',
  'booking',
  'none',
] as const;

/**
 * docs/architecture/domain-model.md Module 7 / mongodb-schema.md `tasks`.
 * CRM-003: Tasks / Next Action vertical slice.
 *
 * Tenant-scoped CRM task linked to a Lead and/or Contact.
 * Assigned to a Position inside the organization.
 */
@Schema({ collection: 'tasks', timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } })
export class TaskDocument extends Document {
  declare _id: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId })
  organizationId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  title!: string;

  @Prop({ required: false, trim: true })
  description?: string;

  @Prop({ required: true, enum: TASK_STATUSES, default: 'open' })
  status!: TaskStatus;

  @Prop({ required: false, type: Date })
  dueAt?: Date;

  /**
   * Плановое начало. Экран разделяет дату и время отдельными полями, но
   * хранится один момент времени: две части одного значения, разнесённые по
   * колонкам, неизбежно разъезжаются. Разделение — забота представления.
   */
  @Prop({ required: false, type: Date })
  startAt?: Date;

  @Prop({ required: true, enum: TASK_PRIORITIES, default: 'medium' })
  priority!: TaskPriority;

  @Prop({ required: true, enum: TASK_CATEGORIES, default: 'work' })
  taskCategory!: TaskCategory;

  /** Цветовая метка задачи в формате #rrggbb; отсутствие метки — не цвет, а null. */
  @Prop({ required: false, type: String, default: null })
  colorHex?: string | null;

  /** Напоминания: за сколько минут до начала. Пустой массив — напоминаний нет. */
  @Prop({ type: [Number], default: [] })
  reminderOffsetsMinutes!: number[];

  /**
   * Подзадачи хранятся вложенным массивом, а не отдельной коллекцией: они не
   * существуют вне своей задачи, не адресуются снаружи и всегда читаются
   * вместе с ней.
   */
  @Prop({
    type: [{ id: String, title: String, done: Boolean }],
    default: [],
  })
  subtasks!: Array<{ id: string; title: string; done: boolean }>;

  /**
   * Имена прикреплённых файлов. ADR-008: тела файлов не ходят через API, а
   * полноценные вложения потребуют media-asset'ов; пока экран показывает
   * только имена, и хранится ровно то, что он показывает.
   */
  @Prop({ type: [String], default: [] })
  attachmentFileNames!: string[];

  /**
   * Привязка к произвольной сущности. `leadId`/`contactId` выше остаются —
   * они несут доменные связи (скоуп, «следующее действие» лида), а эта пара
   * отвечает за то, что показано в карточке задачи.
   */
  @Prop({ required: true, enum: TASK_ENTITY_TYPES, default: 'none' })
  entityType!: TaskEntityType;

  @Prop({ type: Types.ObjectId, required: false })
  entityId?: Types.ObjectId;

  /** Создана автоматически по триггеру, а не человеком. */
  @Prop({ required: true, default: false })
  isAutomatic!: boolean;

  @Prop({ required: false, trim: true })
  triggerType?: string;

  @Prop({ type: Types.ObjectId, required: false })
  assignedPositionId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: false })
  leadId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: false })
  contactId?: Types.ObjectId;

  @Prop({ required: false, type: Date })
  completedAt?: Date;

  @Prop({ type: Types.ObjectId, required: false })
  completedByPositionId?: Types.ObjectId;

  /**
   * Кто создал задачу. Экран показывает «Создал» отдельной строкой, а до
   * 02.09.2026 создатель нигде не сохранялся — он был известен в момент
   * создания (actorPositionId) и терялся сразу после.
   */
  @Prop({ type: Types.ObjectId, required: false })
  createdByPositionId?: Types.ObjectId;

  /**
   * conventions.md разд.5 optimistic concurrency — тот же паттерн, что
   * LeadDocument.version/UnitDocument.version: PATCH /tasks/:taskId,
   * POST /tasks/:taskId/complete и PATCH /tasks/:taskId/reassign
   * принимают expectedVersion и атомарно проверяют его в одном Mongo
   * updateOne (не read-then-write), чтобы два параллельных изменения
   * одной задачи не затирали друг друга молча.
   */
  @Prop({ required: true, default: 0 })
  version!: number;

  declare createdAt: Date;
  declare updatedAt: Date;
}

export const TaskSchema = SchemaFactory.createForClass(TaskDocument);

// Compound indexes for pagination and filtered lookups
TaskSchema.index({ organizationId: 1, _id: -1 });
TaskSchema.index({ organizationId: 1, assignedPositionId: 1, status: 1 });
TaskSchema.index({ organizationId: 1, leadId: 1, status: 1 });
TaskSchema.index({ organizationId: 1, contactId: 1 });
TaskSchema.index({ organizationId: 1, dueAt: 1 });
TaskSchema.index({ organizationId: 1, status: 1 });
