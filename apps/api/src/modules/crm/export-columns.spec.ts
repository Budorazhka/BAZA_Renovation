import {
  EXPORT_ENTITIES,
  EXPORT_ENTITY_READ_PERMISSION,
  EXPORT_HEADERS,
  contactRow,
  dealRow,
  exportFileName,
  formatDateTime,
  leadRow,
  taskRow,
} from './export-columns';
import type {
  CrmContactReadModel,
  CrmDealReadModel,
  CrmLeadReadModel,
  CrmTaskReadModel,
} from './crm.service';

describe('formatDateTime', () => {
  it('приводит ISO к «ГГГГ-ММ-ДД ЧЧ:ММ»', () => {
    expect(formatDateTime('2026-09-01T14:35:22.123Z')).toBe('2026-09-01 14:35');
  });

  it('пустое значение даёт пустую ячейку, а не «null»', () => {
    expect(formatDateTime(null)).toBe('');
    expect(formatDateTime(undefined)).toBe('');
  });

  it('мусорная дата не роняет выгрузку', () => {
    expect(formatDateTime('не дата')).toBe('');
  });
});

describe('соответствие колонок и строк', () => {
  it('у каждой сущности есть право на чтение и заголовки', () => {
    for (const entity of EXPORT_ENTITIES) {
      expect(EXPORT_ENTITY_READ_PERMISSION[entity]).toBeDefined();
      expect(EXPORT_HEADERS[entity].length).toBeGreaterThan(0);
    }
  });

  it('число ячеек в строке совпадает с числом заголовков — иначе файл «съезжает»', () => {
    const lead = {
      createdAt: '2026-09-01T10:00:00.000Z',
      stage: 'new',
      ownerPositionId: null,
      stalled: false,
      source: { route: 'manual' },
      contact: { id: 'c1', name: 'Иван', phone: '+995500000001' },
    } as unknown as CrmLeadReadModel;
    const deal = {
      createdAt: '2026-09-01T10:00:00.000Z',
      title: 'Сделка',
      stage: 'showing',
      ownerPositionId: 'p1',
      expectedCommission: null,
      contact: null,
    } as unknown as CrmDealReadModel;
    const contact = {
      createdAt: '2026-09-01T10:00:00.000Z',
      name: 'Иван',
      phone: '+995500000001',
      email: null,
    } as unknown as CrmContactReadModel;
    const task = {
      createdAt: '2026-09-01T10:00:00.000Z',
      title: 'Позвонить',
      status: 'open',
      dueAt: null,
      assignedPositionId: null,
      leadId: null,
      contactId: null,
      completedAt: null,
    } as unknown as CrmTaskReadModel;

    expect(leadRow(lead)).toHaveLength(EXPORT_HEADERS.leads.length);
    expect(dealRow(deal)).toHaveLength(EXPORT_HEADERS.deals.length);
    expect(contactRow(contact)).toHaveLength(EXPORT_HEADERS.contacts.length);
    expect(taskRow(task)).toHaveLength(EXPORT_HEADERS.tasks.length);
  });
});

describe('перевод значений', () => {
  function makeLead(stage: string, stalled = false): CrmLeadReadModel {
    return {
      createdAt: '2026-09-01T10:00:00.000Z',
      stage,
      ownerPositionId: null,
      stalled,
      source: { route: '/listings/x' },
      contact: { id: 'c1', name: 'Иван', phone: '+995500000001', email: 'i@e.test' },
    } as unknown as CrmLeadReadModel;
  }

  it('стадия лида и признак зависания — по-русски', () => {
    expect(leadRow(makeLead('new'))[1]).toBe('Новый');
    expect(leadRow(makeLead('converted'))[1]).toBe('Конвертирован');
    expect(leadRow(makeLead('new', true))[7]).toBe('да');
    expect(leadRow(makeLead('new', false))[7]).toBe('нет');
  });

  it('неизвестная стадия отдаётся как есть, а не пустой ячейкой', () => {
    expect(leadRow(makeLead('какая-то_новая'))[1]).toBe('какая-то_новая');
  });

  it('контакт лида разложен по колонкам, отсутствующий — пустые ячейки', () => {
    const row = leadRow(makeLead('new'));
    expect(row[2]).toBe('Иван');
    expect(row[3]).toBe('+995500000001');
    expect(row[4]).toBe('i@e.test');

    const noContact = leadRow({ ...makeLead('new'), contact: null } as CrmLeadReadModel);
    expect(noContact[2]).toBe('');
    expect(noContact[3]).toBe('');
  });

  it('комиссия сделки — число в основных единицах, валюта отдельной колонкой', () => {
    const deal = {
      createdAt: '2026-09-01T10:00:00.000Z',
      title: 'Вилла',
      stage: 'deposit',
      ownerPositionId: 'p1',
      expectedCommission: { amountMinorUnits: 1_500_000, currency: 'USD' },
      contact: { id: 'c1', name: 'Пётр', phone: '+995500000002' },
    } as unknown as CrmDealReadModel;
    const row = dealRow(deal);

    expect(row[2]).toBe('Аванс');
    expect(row[6]).toBe(15_000);
    expect(row[7]).toBe('USD');
  });

  it('сделка без комиссии — пустые ячейки суммы и валюты', () => {
    const deal = {
      createdAt: '2026-09-01T10:00:00.000Z',
      title: 'Без комиссии',
      stage: 'showing',
      ownerPositionId: 'p1',
      expectedCommission: null,
      contact: null,
    } as unknown as CrmDealReadModel;
    const row = dealRow(deal);

    expect(row[6]).toBe('');
    expect(row[7]).toBe('');
  });

  it('статус задачи — по-русски', () => {
    const task = {
      createdAt: '2026-09-01T10:00:00.000Z',
      title: 'Позвонить',
      status: 'completed',
      dueAt: '2026-09-02T09:00:00.000Z',
      assignedPositionId: 'p1',
      leadId: null,
      contactId: null,
      completedAt: '2026-09-02T08:30:00.000Z',
    } as unknown as CrmTaskReadModel;
    const row = taskRow(task);

    expect(row[2]).toBe('Завершена');
    expect(row[3]).toBe('2026-09-02 09:00');
    expect(row[7]).toBe('2026-09-02 08:30');
  });
});

describe('exportFileName', () => {
  it('следует паттерну выгрузки шахматки: <сущность>_<организация>_<дата>.xlsx', () => {
    expect(exportFileName('leads', 'Агентство Батуми', new Date('2026-09-01T12:00:00.000Z'))).toBe(
      'leads_Агентство_Батуми_2026-09-01.xlsx',
    );
  });

  it('сохраняет ё и обрезает слишком длинное имя организации', () => {
    expect(exportFileName('deals', 'Зелёный Мыс', new Date('2026-09-01T00:00:00.000Z'))).toBe(
      'deals_Зелёный_Мыс_2026-09-01.xlsx',
    );
    const long = exportFileName('tasks', 'А'.repeat(80), new Date('2026-09-01T00:00:00.000Z'));
    expect(long).toBe(`tasks_${'А'.repeat(40)}_2026-09-01.xlsx`);
  });
});
