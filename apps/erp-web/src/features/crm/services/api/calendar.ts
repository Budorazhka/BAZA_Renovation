import type { AxiosInstance } from 'axios';
import type {
  ApiResponse,
  PaginatedResult,
  CalendarEvent,
  CreateCalendarEventDto,
  UpdateCalendarEventDto,
  EventType,
  EventStatus,
  UserRole,
  TaskFile,
} from './types';
import { getAuthQuery } from './client';

export type ApiContext = {
  api: AxiosInstance;
};

export function createCalendarMethods(ctx: ApiContext) {
  const { api } = ctx;
  const auth = () => getAuthQuery();

  return {
    createCalendarEvent(
      data: CreateCalendarEventDto,
      userId?: string
    ): Promise<ApiResponse<CalendarEvent>> {
      return api
        .post('/calendar/events', data, {
          params: { ...(userId ? { userId } : {}), ...auth() },
        })
        .then((r) => r.data);
    },
    getCalendarEvents(params?: {
      page?: number;
      limit?: number;
      startDate?: string;
      endDate?: string;
      type?: EventType;
      status?: EventStatus;
      leadId?: string;
      taskId?: string;
      isRecurring?: boolean;
      search?: string;
      userId?: string;
      userRole?: UserRole;
    }): Promise<ApiResponse<PaginatedResult<CalendarEvent>>> {
      const base: any = { page: 1, limit: 20, ...(params || {}) };
      return api.get('/calendar/events', { params: { ...base, ...auth() } }).then((r) => r.data);
    },
    getCalendarEventsView(params: {
      startDate: string;
      endDate: string;
      type?: EventType;
      userId?: string;
      userRole?: UserRole;
    }): Promise<ApiResponse<CalendarEvent[]>> {
      return api
        .get('/calendar/events/view', { params: { ...params, ...auth() } })
        .then((r) => r.data);
    },
    getCalendarEvent(id: string): Promise<ApiResponse<CalendarEvent>> {
      return api.get(`/calendar/events/${id}`, { params: auth() }).then((r) => r.data);
    },
    updateCalendarEvent(
      id: string,
      data: UpdateCalendarEventDto,
      userId?: string,
      userRole?: UserRole
    ): Promise<ApiResponse<CalendarEvent>> {
      return api
        .patch(`/calendar/events/${id}`, data, {
          params: { ...(userId ? { userId } : {}), ...(userRole ? { userRole } : {}), ...auth() },
        })
        .then((r) => r.data);
    },
    deleteCalendarEvent(id: string, userId: string, userRole?: UserRole): Promise<ApiResponse<{ deleted: boolean }>> {
      if (!userId) throw new Error('userId is required for deleting calendar event');
      return api
        .delete(`/calendar/events/${id}`, {
          params: { userId, ...(userRole ? { userRole } : {}), ...auth() },
        })
        .then((r) => r.data);
    },
    getCalendarUnified(params: {
      startDate: string;
      endDate: string;
      type?: EventType;
      userId?: string;
      userRole?: UserRole;
    }): Promise<
      ApiResponse<{
        events: CalendarEvent[];
        tasks: Array<{
          _id: string;
          title: string;
          description?: string;
          startDate: Date;
          endDate: Date;
          priority: string;
          status: string;
          type: 'task';
          taskId: string;
          colorLabel?: string;
          category?: number;
          categories?: string[];
          hasFiles?: boolean;
          files?: TaskFile[];
        }>;
      }>
    > {
      return api
        .get('/calendar/unified', { params: { ...params, ...auth() } })
        .then((r) => r.data);
    },
    moveCalendarEvent(
      id: string,
      data: { newStartTime: string; newEndTime: string },
      userId?: string,
      userRole?: UserRole
    ): Promise<ApiResponse<CalendarEvent>> {
      return api
        .patch(`/calendar/events/${id}/move`, data, {
          params: { ...(userId ? { userId } : {}), ...(userRole ? { userRole } : {}), ...auth() },
        })
        .then((r) => r.data);
    },
  };
}
