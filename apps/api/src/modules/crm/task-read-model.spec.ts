import { Types } from 'mongoose';
import { toTaskReadModel } from './crm.service';
import type { TaskDocument } from './schemas/task.schema';

/**
 * Экран задач ERP показывает четыре состояния, включая «Просрочена». Продукт
 * требует, чтобы интерфейс не менялся, поэтому модель на сервере расширена
 * под него — но «просрочена» намеренно НЕ хранится: это производное от срока
 * и статуса, и хранимое поле устаревало бы само каждую полночь.
 *
 * Здесь закреплено именно вычисление: остальные новые поля просто переносятся
 * один в один и проверяются типами.
 */

const HOUR = 60 * 60 * 1000;

function makeTask(overrides: Partial<TaskDocument> = {}): TaskDocument {
  return {
    _id: new Types.ObjectId(),
    organizationId: new Types.ObjectId(),
    title: 'Позвонить клиенту',
    status: 'open',
    version: 0,
    createdAt: new Date('2026-09-01T10:00:00.000Z'),
    isUrgent: false,
    isImportant: true,
    taskCategory: 'work',
    isAutomatic: false,
    reminderOffsetsMinutes: [],
    subtasks: [],
    attachmentFileNames: [],
    ...overrides,
  } as unknown as TaskDocument;
}

describe('toTaskReadModel — вычисляемая просрочка', () => {
  it('срок в прошлом у открытой задачи — просрочена', () => {
    const task = makeTask({ status: 'open', dueAt: new Date(Date.now() - HOUR) } as Partial<TaskDocument>);

    expect(toTaskReadModel(task).isOverdue).toBe(true);
  });

  it('срок в прошлом у взятой в работу — тоже просрочена', () => {
    const task = makeTask({ status: 'in_progress', dueAt: new Date(Date.now() - HOUR) } as Partial<TaskDocument>);

    expect(toTaskReadModel(task).isOverdue).toBe(true);
  });

  it('срок в будущем — не просрочена', () => {
    const task = makeTask({ status: 'open', dueAt: new Date(Date.now() + HOUR) } as Partial<TaskDocument>);

    expect(toTaskReadModel(task).isOverdue).toBe(false);
  });

  it('без срока просрочки не бывает', () => {
    expect(toTaskReadModel(makeTask({ status: 'open' })).isOverdue).toBe(false);
  });

  for (const status of ['completed', 'cancelled'] as const) {
    it(`статус ${status} со сроком в прошлом просроченным НЕ считается`, () => {
      const task = makeTask({ status, dueAt: new Date(Date.now() - HOUR) } as Partial<TaskDocument>);

      expect(toTaskReadModel(task).isOverdue).toBe(false);
    });
  }

  it('новые поля доезжают до модели чтения, а отсутствующие получают безопасные значения', () => {
    const leadId = new Types.ObjectId();
    const view = toTaskReadModel(
      makeTask({
        isUrgent: true,
        isImportant: true,
        taskCategory: 'personal',
        colorHex: '#e11d48',
        reminderOffsetsMinutes: [15, 60],
        subtasks: [{ id: 's-1', title: 'Подготовить договор', done: true }],
        attachmentFileNames: ['договор.pdf'],
        leadId,
        isAutomatic: true,
        triggerType: 'new_lead_sla',
        startAt: new Date('2026-09-02T08:00:00.000Z'),
      } as Partial<TaskDocument>),
    );

    expect(view.priority).toBe('critical');
    expect(view.taskCategory).toBe('personal');
    expect(view.colorHex).toBe('#e11d48');
    expect(view.reminderOffsetsMinutes).toEqual([15, 60]);
    expect(view.subtasks).toEqual([{ id: 's-1', title: 'Подготовить договор', done: true }]);
    expect(view.attachmentFileNames).toEqual(['договор.pdf']);
    expect(view.entityType).toBe('lead');
    expect(view.entityId).toBe(leadId.toString());
    expect(view.isAutomatic).toBe(true);
    expect(view.triggerType).toBe('new_lead_sla');
    expect(view.startAt).toBe('2026-09-02T08:00:00.000Z');
  });

  it('приоритет выводится из пары «срочно / важно» — квадрант, а не шкала', () => {
    const quadrant = (isUrgent: boolean, isImportant: boolean) =>
      toTaskReadModel(makeTask({ isUrgent, isImportant } as Partial<TaskDocument>)).priority;

    expect(quadrant(true, true)).toBe('critical');
    expect(quadrant(true, false)).toBe('high');
    expect(quadrant(false, true)).toBe('medium');
    expect(quadrant(false, false)).toBe('low');
  });

  it('признаки доезжают до модели чтения как есть', () => {
    const view = toTaskReadModel(makeTask({ isUrgent: true, isImportant: false } as Partial<TaskDocument>));
    expect(view.isUrgent).toBe(true);
    expect(view.isImportant).toBe(false);
  });

  it('связь выводится из хранимых ссылок: лид, иначе контакт, иначе ничего', () => {
    const leadId = new Types.ObjectId();
    const contactId = new Types.ObjectId();

    const withLead = toTaskReadModel(makeTask({ leadId, contactId } as Partial<TaskDocument>));
    expect(withLead.entityType).toBe('lead');
    expect(withLead.entityId).toBe(leadId.toString());

    const withContact = toTaskReadModel(makeTask({ contactId } as Partial<TaskDocument>));
    expect(withContact.entityType).toBe('client');
    expect(withContact.entityId).toBe(contactId.toString());

    const alone = toTaskReadModel(makeTask());
    expect(alone.entityType).toBe('none');
    expect(alone.entityId).toBeNull();
  });

  it('создатель попадает в модель чтения — экран показывает «Создал»', () => {
    const createdBy = new Types.ObjectId();

    expect(toTaskReadModel(makeTask({ createdByPositionId: createdBy } as Partial<TaskDocument>)).createdByPositionId).toBe(
      createdBy.toString(),
    );
    expect(toTaskReadModel(makeTask()).createdByPositionId).toBeNull();
  });

  it('задача, созданная до расширения модели, читается без падения', () => {
    // У старых документов новых полей физически нет — читатель обязан это
    // переживать, иначе расширение модели ломает уже существующие данные.
    const legacy = {
      _id: new Types.ObjectId(),
      organizationId: new Types.ObjectId(),
      title: 'Старая задача',
      status: 'open',
      version: 0,
      createdAt: new Date('2026-08-01T10:00:00.000Z'),
    } as unknown as TaskDocument;

    const view = toTaskReadModel(legacy);

    expect(view.priority).toBe('medium');
    expect(view.taskCategory).toBe('work');
    expect(view.entityType).toBe('none');
    expect(view.subtasks).toEqual([]);
    expect(view.isAutomatic).toBe(false);
    expect(view.isOverdue).toBe(false);
  });
});
