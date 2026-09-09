import axios from 'axios';
import { PLATFORM_API_BASE_URL, CRM_API_BASE_URL } from '@/config/backend';
import type { LMSItem, LMSCourse } from '@/data/lms-mock';
import type { ApiResponse, FileEntity } from './developmentApi';

/**
 * Сервисный слой вкладки «Обучение» (LMS).
 *
 * Контракт REST-эндпоинтов BAZA Platform API (apps/api/src/modules/lms/lms.controller.ts):
 *   GET    /api/v1/lms/items            → ApiResponse<LMSItem[]>
 *   POST   /api/v1/lms/items            → ApiResponse<LMSItem> (требует Idempotency-Key)
 *   PATCH  /api/v1/lms/items/:id        → ApiResponse<LMSItem>
 *   DELETE /api/v1/lms/items/:id        → ApiResponse<{ deleted: boolean }>
 *
 *   GET    /api/v1/lms/courses          → ApiResponse<LMSCourse[]>
 *   POST   /api/v1/lms/courses          → ApiResponse<LMSCourse> (требует Idempotency-Key)
 *   PATCH  /api/v1/lms/courses/:id      → ApiResponse<LMSCourse>
 *   DELETE /api/v1/lms/courses/:id      → ApiResponse<{ deleted: boolean }>
 *
 *   POST   /api/files (multipart)       → ApiResponse<FileEntity> (обложки, PDF, видео)
 *
 * Прогресс ученика (привязан к позиции и организации):
 *   GET    /api/v1/lms/progress              → ApiResponse<LMSProgressMap>     (все курсы текущего сотрудника)
 *   PUT    /api/v1/lms/progress/:courseId    → ApiResponse<LMSProgressEntry>   (upsert по курсу)
 *   DELETE /api/v1/lms/progress/:courseId    → ApiResponse<{ deleted: boolean }>
 *
 * localStorage остаётся мгновенным кэшем/фолбэком (см. components/lms/progress.ts).
 */

const api = axios.create({
  baseURL: PLATFORM_API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

const crmFilesApi = axios.create({
  baseURL: CRM_API_BASE_URL,
  withCredentials: true,
});

export function newIdempotencyKey(): string {
  const globalCrypto = typeof window !== 'undefined' ? window.crypto : (globalThis as unknown as { crypto?: Crypto }).crypto;
  if (globalCrypto && typeof globalCrypto.randomUUID === 'function') {
    return globalCrypto.randomUUID();
  }
  return `lms-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/** Данные материала без серверного id — для создания. */
export type LMSItemInput = Omit<LMSItem, 'id'>;
/** Данные курса без серверного id — для создания. */
export type LMSCourseInput = Omit<LMSCourse, 'id'>;

/** Прогресс пользователя по одному курсу (формат хранения = формат на проводе). */
export interface LMSProgressEntry {
  completedItems: string[];
  finalQuizPassed?: boolean;
  finalQuizScore?: number;
}
/** Карта прогресса: courseId → запись. */
export type LMSProgressMap = Record<string, LMSProgressEntry>;

export interface ListLmsItemsQuery {
  type?: string;
  targetRole?: string;
  search?: string;
}

export interface ListLmsCoursesQuery {
  targetRole?: string;
  search?: string;
}

export const lmsApi = {
  // ─── Материалы библиотеки ──────────────────────────────────────────────────
  getItems: (query?: ListLmsItemsQuery) =>
    api
      .get<ApiResponse<LMSItem[]>>('/api/v1/lms/items', { params: query })
      .then((r) => r.data.data),

  createItem: (data: LMSItemInput, idempotencyKey = newIdempotencyKey()) =>
    api
      .post<ApiResponse<LMSItem>>('/api/v1/lms/items', data, {
        headers: { 'idempotency-key': idempotencyKey },
      })
      .then((r) => r.data.data),

  updateItem: (id: string, data: Partial<LMSItemInput>) =>
    api
      .patch<ApiResponse<LMSItem>>(`/api/v1/lms/items/${id}`, data)
      .then((r) => r.data.data),

  deleteItem: (id: string) =>
    api
      .delete<ApiResponse<{ deleted: boolean }>>(`/api/v1/lms/items/${id}`)
      .then((r) => r.data.data),

  // ─── Курсы ─────────────────────────────────────────────────────────────────
  getCourses: (query?: ListLmsCoursesQuery) =>
    api
      .get<ApiResponse<LMSCourse[]>>('/api/v1/lms/courses', { params: query })
      .then((r) => r.data.data),

  createCourse: (data: LMSCourseInput, idempotencyKey = newIdempotencyKey()) =>
    api
      .post<ApiResponse<LMSCourse>>('/api/v1/lms/courses', data, {
        headers: { 'idempotency-key': idempotencyKey },
      })
      .then((r) => r.data.data),

  updateCourse: (id: string, data: Partial<LMSCourseInput>) =>
    api
      .patch<ApiResponse<LMSCourse>>(`/api/v1/lms/courses/${id}`, data)
      .then((r) => r.data.data),

  deleteCourse: (id: string) =>
    api
      .delete<ApiResponse<{ deleted: boolean }>>(`/api/v1/lms/courses/${id}`)
      .then((r) => r.data.data),

  // ─── Прогресс ученика ──────────────────────────────────────────────────────
  getProgress: () =>
    api
      .get<ApiResponse<LMSProgressMap>>('/api/v1/lms/progress')
      .then((r) => r.data.data),

  putProgress: (courseId: string, entry: LMSProgressEntry) =>
    api
      .put<ApiResponse<LMSProgressEntry>>(`/api/v1/lms/progress/${courseId}`, entry)
      .then((r) => r.data.data),

  deleteProgress: (courseId: string) =>
    api
      .delete<ApiResponse<{ deleted: boolean }>>(`/api/v1/lms/progress/${courseId}`)
      .then((r) => r.data.data),

  // ─── Файлы (обложки, PDF, видео) ───────────────────────────────────────────
  /** Загружает файл на сервер и возвращает запись с постоянным url. */
  uploadFile: (file: File, purpose = 'lms') => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('purpose', purpose);
    formData.append('entityType', 'lms');
    return crmFilesApi
      .post<ApiResponse<FileEntity>>('/api/files', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      })
      .then((r) => r.data.data);
  },
};
