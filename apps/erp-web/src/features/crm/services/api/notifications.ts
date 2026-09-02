import type { AxiosInstance } from 'axios';
import type {
  ApiResponse,
  PaginatedResult,
  Notification,
  CreateNotificationDto,
  UpdateNotificationDto,
  NotificationFilterDto,
  BulkMarkReadDto,
  RespondToRequestDto,
  UserRole,
} from './types';
import { getAuthQuery, getAdminHeaders } from './client';

export type ApiContext = {
  api: AxiosInstance;
};

export function createNotificationsMethods(ctx: ApiContext) {
  const { api } = ctx;
  const auth = () => getAuthQuery();
  const adminH = () => getAdminHeaders(api);

  return {
    createNotification(
      data: CreateNotificationDto,
      createdBy?: string
    ): Promise<ApiResponse<Notification>> {
      return api
        .post('/notifications', data, {
          params: { ...(createdBy ? { createdBy } : {}), ...auth() },
        })
        .then((r) => r.data);
    },
    getNotifications(
      params?: ({ page?: number; limit?: number } & NotificationFilterDto) & {
        userId?: string;
        userRole?: UserRole;
      }
    ): Promise<ApiResponse<PaginatedResult<Notification>>> {
      const base: any = { page: 1, limit: 20, ...(params || {}) };
      if (typeof base.isRead === 'boolean') base.isRead = String(base.isRead);
      if (typeof base.isArchived === 'boolean') base.isArchived = String(base.isArchived);
      return api.get('/notifications', { params: { ...base, ...auth() } }).then((r) => r.data);
    },
    getUnreadNotificationsCount(query?: {
      userId?: string;
      userRole?: UserRole;
    }): Promise<ApiResponse<number>> {
      return api
        .get('/notifications/unread-count', { params: { ...auth(), ...(query || {}) } })
        .then((r) => r.data);
    },
    getNotification(id: string): Promise<ApiResponse<Notification>> {
      return api
        .get(`/notifications/${id}`, {
          headers: adminH(),
          params: auth(),
        })
        .then((r) => r.data);
    },
    updateNotification(id: string, data: UpdateNotificationDto): Promise<ApiResponse<Notification>> {
      return api.patch(`/notifications/${id}`, data, { params: auth() }).then((r) => r.data);
    },
    markNotificationRead(id: string, isRead: boolean): Promise<ApiResponse<Notification>> {
      return api
        .patch(`/notifications/${id}/read`, { isRead }, { params: auth() })
        .then((r) => r.data);
    },
    archiveNotification(id: string, isArchived: boolean): Promise<ApiResponse<Notification>> {
      return api
        .patch(`/notifications/${id}/archive`, { isArchived }, { params: auth() })
        .then((r) => r.data);
    },
    bulkMarkNotificationsAsRead(body: BulkMarkReadDto): Promise<ApiResponse<{ modifiedCount: number }>> {
      return api.post('/notifications/bulk-read', body, { params: auth() }).then((r) => r.data);
    },
    deleteNotification(id: string): Promise<ApiResponse<boolean>> {
      return api.delete(`/notifications/${id}`, { params: auth() }).then((r) => r.data);
    },
    uploadNotificationFile(
      notificationId: string,
      file: File
    ): Promise<ApiResponse<Notification>> {
      const fd = new FormData();
      fd.append('file', file);
      return api
        .post(`/notifications/${notificationId}/files`, fd, {
          headers: { 'Content-Type': 'multipart/form-data', ...adminH() },
          params: auth(),
        })
        .then((r) => r.data);
    },
    uploadNotificationFilesBulk(
      notificationId: string,
      files: File[]
    ): Promise<ApiResponse<Notification>> {
      const fd = new FormData();
      files.forEach((f) => fd.append('files', f));
      return api
        .post(`/notifications/${notificationId}/files/bulk`, fd, {
          headers: { 'Content-Type': 'multipart/form-data', ...adminH() },
          params: auth(),
        })
        .then((r) => r.data);
    },
    deleteNotificationFileByIndex(
      notificationId: string,
      fileIndex: number
    ): Promise<ApiResponse<Notification>> {
      return api
        .delete(`/notifications/${notificationId}/files/${fileIndex}`, { params: auth() })
        .then((r) => r.data);
    },
    respondToNotificationRequest(
      notificationId: string,
      data: RespondToRequestDto
    ): Promise<ApiResponse<Notification>> {
      return api
        .post(`/notifications/${notificationId}/respond`, data, { params: auth() })
        .then((r) => r.data);
    },
    createTaskReminderNotification(body: {
      taskId: string;
      userId: string;
      dueDate: string;
    }): Promise<ApiResponse<Notification>> {
      return api.post('/notifications/task-reminder', body).then((r) => r.data);
    },
    createLeadUpdateNotification(body: {
      leadId: string;
      userId: string;
      updateType: string;
    }): Promise<ApiResponse<Notification>> {
      return api.post('/notifications/lead-update', body).then((r) => r.data);
    },
    createNewsNotifications(body: {
      title: string;
      message: string;
      userIds: string[];
    }): Promise<ApiResponse<Notification[]>> {
      return api.post('/notifications/news', body).then((r) => r.data);
    },
  };
}
