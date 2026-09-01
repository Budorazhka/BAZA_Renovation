import axios from 'axios';
import { CRM_API_BASE_URL } from '@/config/backend';
import type { LMSItem, LMSCourse } from '@/data/lms-mock';
import type { ApiResponse, FileEntity } from './developmentApi';

/**
 * Сервисный слой вкладки «Обучение» (LMS).
 *
 * Контракт REST-эндпоинтов (бэкенд пока не поднят — фронт ходит сюда, при
 * недоступности откатывается на моки в useLmsLibrary):
 *
 *   GET    /api/lms/items            → ApiResponse<LMSItem[]>
 *   POST   /api/lms/items            → ApiResponse<LMSItem>
 *   PATCH  /api/lms/items/:id        → ApiResponse<LMSItem>
 *   DELETE /api/lms/items/:id        → ApiResponse<{ deleted: boolean }>
 *
 *   GET    /api/lms/courses          → ApiResponse<LMSCourse[]>
 *   POST   /api/lms/courses          → ApiResponse<LMSCourse>
 *   PATCH  /api/lms/courses/:id      → ApiResponse<LMSCourse>
 *   DELETE /api/lms/courses/:id      → ApiResponse<{ deleted: boolean }>
 *
 *   POST   /api/files (multipart)    → ApiResponse<FileEntity>   (обложки, PDF, видео)
 *
 * Прогресс ученика (привязан к пользователю по JWT):
 *   GET    /api/lms/progress              → ApiResponse<LMSProgressMap>     (все курсы текущего юзера)
 *   PUT    /api/lms/progress/:courseId    → ApiResponse<LMSProgressEntry>   (upsert по курсу)
 *   DELETE /api/lms/progress/:courseId    → ApiResponse<{ deleted: boolean }>
 *
 * localStorage остаётся мгновенным кэшем/фолбэком (см. components/lms/progress.ts).
 */

const api = axios.create({
  baseURL: CRM_API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

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

export const lmsApi = {
  // ─── Материалы библиотеки ──────────────────────────────────────────────────
  getItems: () =>
    api.get<ApiResponse<LMSItem[]>>('/api/lms/items').then((r) => r.data.data),

  createItem: (data: LMSItemInput) =>
    api.post<ApiResponse<LMSItem>>('/api/lms/items', data).then((r) => r.data.data),

  updateItem: (id: string, data: Partial<LMSItemInput>) =>
    api.patch<ApiResponse<LMSItem>>(`/api/lms/items/${id}`, data).then((r) => r.data.data),

  deleteItem: (id: string) =>
    api.delete<ApiResponse<{ deleted: boolean }>>(`/api/lms/items/${id}`).then((r) => r.data.data),

  // ─── Курсы ─────────────────────────────────────────────────────────────────
  getCourses: () =>
    api.get<ApiResponse<LMSCourse[]>>('/api/lms/courses').then((r) => r.data.data),

  createCourse: (data: LMSCourseInput) =>
    api.post<ApiResponse<LMSCourse>>('/api/lms/courses', data).then((r) => r.data.data),

  updateCourse: (id: string, data: Partial<LMSCourseInput>) =>
    api.patch<ApiResponse<LMSCourse>>(`/api/lms/courses/${id}`, data).then((r) => r.data.data),

  deleteCourse: (id: string) =>
    api.delete<ApiResponse<{ deleted: boolean }>>(`/api/lms/courses/${id}`).then((r) => r.data.data),

  // ─── Прогресс ученика ──────────────────────────────────────────────────────
  getProgress: () =>
    api.get<ApiResponse<LMSProgressMap>>('/api/lms/progress').then((r) => r.data.data),

  putProgress: (courseId: string, entry: LMSProgressEntry) =>
    api
      .put<ApiResponse<LMSProgressEntry>>(`/api/lms/progress/${courseId}`, entry)
      .then((r) => r.data.data),

  deleteProgress: (courseId: string) =>
    api
      .delete<ApiResponse<{ deleted: boolean }>>(`/api/lms/progress/${courseId}`)
      .then((r) => r.data.data),

  // ─── Файлы (обложки, PDF, видео) ───────────────────────────────────────────
  /** Загружает файл на сервер и возвращает запись с постоянным url. */
  uploadFile: (file: File, purpose = 'lms') => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('purpose', purpose);
    formData.append('entityType', 'lms');
    return api
      .post<ApiResponse<FileEntity>>('/api/files', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      })
      .then((r) => r.data.data);
  },
};
