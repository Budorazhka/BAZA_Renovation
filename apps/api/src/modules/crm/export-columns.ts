import type { XlsxCell } from '../../shared/xlsx/build-workbook';
import type {
  CrmContactReadModel,
  CrmDealReadModel,
  CrmLeadReadModel,
  CrmTaskReadModel,
} from './crm.service';

/**
 * Колонки выгрузок CRM (export.run). Чистые функции: что за колонки и как
 * форматируется значение — здесь, сборка самого файла — в
 * shared/xlsx/build-workbook.ts. Так формат покрывается тестами без
 * workbook-рантайма, тот же принцип, что уже применён к шахматке
 * (chessboard-export.ts).
 *
 * Подписи русские и человеческие, значения перечислений переводятся — файл
 * открывает не разработчик, а сотрудник агентства. Тот же выбор, что в
 * выгрузке шахматки.
 *
 * Колонки берутся ИЗ read-моделей, которые уже отдают соответствующие
 * list-эндпоинты: выгрузка не показывает ничего сверх того, что человек и
 * так видит в списке, — иначе она стала бы обходом ограничений выдачи.
 */

export type ExportEntity = 'leads' | 'deals' | 'contacts' | 'tasks';

export const EXPORT_ENTITIES: readonly ExportEntity[] = ['leads', 'deals', 'contacts', 'tasks'];

/** Право на чтение, без которого выгрузка сущности недопустима. */
export const EXPORT_ENTITY_READ_PERMISSION: Record<ExportEntity, { resource: string; action: string }> = {
  leads: { resource: 'lead', action: 'read' },
  deals: { resource: 'deal', action: 'read' },
  contacts: { resource: 'contact', action: 'read' },
  tasks: { resource: 'task', action: 'read' },
};

export const EXPORT_SHEET_NAME: Record<ExportEntity, string> = {
  leads: 'Лиды',
  deals: 'Сделки',
  contacts: 'Контакты',
  tasks: 'Задачи',
};

const LEAD_STAGE_RU: Record<string, string> = {
  new: 'Новый',
  contacted: 'Взят в работу',
  qualified: 'Квалифицирован',
  converted: 'Конвертирован',
  lost: 'Потерян',
};

const DEAL_STAGE_RU: Record<string, string> = {
  showing: 'Показ',
  deposit: 'Аванс',
  deal: 'Сделка',
  golden: 'Золотая',
  check_in: 'Заселение',
  referral: 'Рекомендация',
  closed_lost: 'Проиграна',
};

const TASK_STATUS_RU: Record<string, string> = {
  open: 'Открыта',
  completed: 'Завершена',
  cancelled: 'Отменена',
};

/**
 * ISO-строка → «ГГГГ-ММ-ДД ЧЧ:ММ». Excel сортирует такой формат как текст
 * корректно (лексикографический порядок совпадает с хронологическим), а
 * человек читает его без расшифровки. Пустое значение — пустая ячейка, а
 * не «null».
 */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 16).replace('T', ' ');
}

/** Сумма из minor units в основные — как в выгрузке шахматки. */
function money(amountMinorUnits: number): number {
  return amountMinorUnits / 100;
}

export const EXPORT_HEADERS: Record<ExportEntity, string[]> = {
  leads: ['Создан', 'Стадия', 'Контакт', 'Телефон', 'Email', 'Ответственный', 'Источник', 'Зависший'],
  deals: ['Создана', 'Название', 'Стадия', 'Контакт', 'Телефон', 'Ответственный', 'Комиссия', 'Валюта'],
  contacts: ['Создан', 'Имя', 'Телефон', 'Email'],
  tasks: ['Создана', 'Заголовок', 'Статус', 'Срок', 'Исполнитель', 'Лид', 'Контакт', 'Завершена'],
};

export function leadRow(lead: CrmLeadReadModel): XlsxCell[] {
  return [
    formatDateTime(lead.createdAt),
    LEAD_STAGE_RU[lead.stage] ?? lead.stage,
    lead.contact?.name ?? '',
    lead.contact?.phone ?? '',
    lead.contact?.email ?? '',
    lead.ownerPositionId ?? '',
    lead.source?.route ?? '',
    lead.stalled ? 'да' : 'нет',
  ];
}

export function dealRow(deal: CrmDealReadModel): XlsxCell[] {
  return [
    formatDateTime(deal.createdAt),
    deal.title,
    DEAL_STAGE_RU[deal.stage] ?? deal.stage,
    deal.contact?.name ?? '',
    deal.contact?.phone ?? '',
    deal.ownerPositionId,
    deal.expectedCommission ? money(deal.expectedCommission.amountMinorUnits) : '',
    deal.expectedCommission?.currency ?? '',
  ];
}

export function contactRow(contact: CrmContactReadModel): XlsxCell[] {
  return [formatDateTime(contact.createdAt), contact.name, contact.phone, contact.email ?? ''];
}

export function taskRow(task: CrmTaskReadModel): XlsxCell[] {
  return [
    formatDateTime(task.createdAt),
    task.title,
    TASK_STATUS_RU[task.status] ?? task.status,
    formatDateTime(task.dueAt),
    task.assignedPositionId ?? '',
    task.leadId ?? '',
    task.contactId ?? '',
    formatDateTime(task.completedAt),
  ];
}

/**
 * Имя файла — тот же паттерн, что у выгрузки шахматки:
 * `<сущность>_<организация>_<ГГГГ-ММ-ДД>.xlsx`.
 */
export function exportFileName(entity: ExportEntity, organizationName: string, exportedAt: Date): string {
  const scope = organizationName.replace(/[^\wа-яА-ЯёЁ0-9-]+/g, '_').slice(0, 40);
  return `${entity}_${scope}_${exportedAt.toISOString().slice(0, 10)}.xlsx`;
}
