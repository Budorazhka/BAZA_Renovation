import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import { apiService, TaskStatus as CrmTaskStatus, TaskPriority as CrmTaskPriority, NotificationType as CrmNotificationType, EventType as CrmEventType } from '../services/api';
import type { Task as CrmTask, CalendarEvent as CrmCalendarEvent } from '../services/api';
import { useAuth as useCrmAuth } from '../hooks/useAuth';
import { parseDateFromAPI } from '../utils/dateUtils';
import { useRealtimeSync } from '../hooks/useRealtimeSync';
import type { Task, TaskPriority, TaskStatus } from '@/types/tasks';
import type { DashboardNotifPreview } from '@/data/home-workspace-mock';
import type { Reminder, NewsArticle } from '@/data/info-mock';
import type { CalEvent } from '@/data/calendar-events-mock';

interface CrmSyncContextValue {
  tasks: Task[];
  notifications: DashboardNotifPreview[];
  reminders: Reminder[];
  news: NewsArticle[];
  calendarEvents: CalEvent[];
  isLoading: boolean;
  refresh: () => Promise<void>;
  markNotificationRead: (id: string) => Promise<void>;
  archiveReminder: (id: string) => Promise<void>;
}

const CrmSyncContext = createContext<CrmSyncContextValue | null>(null);

export function CrmSyncProvider({ children }: { children: React.ReactNode }) {
  const { user: crmUser, isAuthenticated } = useCrmAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [notifications, setNotifications] = useState<DashboardNotifPreview[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [news, setNews] = useState<NewsArticle[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const mapCrmEvent = useCallback((e: CrmCalendarEvent): CalEvent => {
    const startDate = new Date(e.startTime);
    const y = startDate.getFullYear();
    const m = String(startDate.getMonth() + 1).padStart(2, '0');
    const d = String(startDate.getDate()).padStart(2, '0');
    const dateStr = `${y}-${m}-${d}`;
    const timeStr = String(startDate.getHours()).padStart(2, '0') + ':' + String(startDate.getMinutes()).padStart(2, '0');

    let type: CalEvent['type'] = 'meeting';
    if (e.type === CrmEventType.CALL) type = 'call';
    else if (e.type === CrmEventType.MEETING) type = 'meeting';
    else if (e.type === CrmEventType.TASK || (e as any).type === 'task') type = 'showing'; // В ERP 'showing' как аналог задачи
    
    const clientName = typeof e.leadId === 'object' ? e.leadId?.name : undefined;

    return {
      id: e._id,
      date: dateStr,
      time: timeStr,
      type: type,
      title: e.title,
      client: clientName,
      location: e.location,
      agentId: e.createdBy,
      agentName: 'Менеджер', // В идеале получить имя из участников или создателя
      dealId: typeof e.leadId === 'object' ? e.leadId?._id : e.leadId,
    };
  }, []);

  const mapCrmTask = useCallback((t: CrmTask): Task => {
    const taskDate = t.endDate ? parseDateFromAPI(t.endDate) : null;
    const startDateParsed = t.startDate ? parseDateFromAPI(t.startDate) : null;
    const isDone = t.status === CrmTaskStatus.COMPLETED;
    
    let dueDate = '';
    let dueTime = undefined;
    if (taskDate) {
      const y = taskDate.getFullYear();
      const m = String(taskDate.getMonth() + 1).padStart(2, '0');
      const d = String(taskDate.getDate()).padStart(2, '0');
      dueDate = `${y}-${m}-${d}`;
      dueTime = String(taskDate.getHours()).padStart(2, '0') + ':' + String(taskDate.getMinutes()).padStart(2, '0');
    }

    let startDate = '';
    let startTime = undefined;
    if (startDateParsed) {
      const y = startDateParsed.getFullYear();
      const m = String(startDateParsed.getMonth() + 1).padStart(2, '0');
      const d = String(startDateParsed.getDate()).padStart(2, '0');
      startDate = `${y}-${m}-${d}`;
      startTime = String(startDateParsed.getHours()).padStart(2, '0') + ':' + String(startDateParsed.getMinutes()).padStart(2, '0');
    }

    const assignedId = typeof t.assignedTo === 'object' ? t.assignedTo?._id : t.assignedTo;
    const assignedName = typeof t.assignedTo === 'object' ? t.assignedTo?.name : 'Менеджер';
    const createdName = typeof t.createdBy === 'object' ? t.createdBy?.name : 'Система';
    
    return {
      id: t._id,
      title: t.title,
      description: t.description || '',
      status: isDone ? 'done' : 
              (taskDate && taskDate < new Date() ? 'overdue' : 'pending') as TaskStatus,
      priority: (t.priority === CrmTaskPriority.URGENT_IMPORTANT ? 'critical' :
                t.priority === CrmTaskPriority.NOT_URGENT_IMPORTANT ? 'medium' :
                t.priority === CrmTaskPriority.URGENT_NOT_IMPORTANT ? 'high' : 'low') as TaskPriority,
      assignedToId: assignedId || '',
      assignedToName: assignedName || 'Менеджер',
      createdByName: createdName || 'Система',
      dueDate: dueDate,
      dueTime: dueTime,
      startDate: startDate,
      startTime: startTime,
      taskCategory: t.category === 1 ? 'personal' : 'work',
      colorHex: t.colorLabel || null,
      reminderOffsetsMinutes: [],
      subtasks: (t.subtasks || []).map((st, idx) => ({
        id: `${t._id}-st-${idx}`,
        title: st.title,
        done: !!st.completed,
      })),
      attachmentFileNames: t.files?.map(f => f.originalName) || [],
      entityType: t.leadId ? 'client' : 'none',
      entityId: typeof t.leadId === 'object' ? (t.leadId as any)?._id : t.leadId,
      entityLabel: t.clientName || (typeof t.leadId === 'object' ? (t.leadId as any)?.name : undefined),
      isAutomatic: false,
      createdAt: t.createdAt || new Date().toISOString(),
    } as Task;
  }, []);

  const fetchData = useCallback(async () => {
    if (!crmUser?.id || !isAuthenticated) return;
    
    setIsLoading(true);
    try {
      const today = new Date();
      // Получаем события за широкий диапазон (3 месяца), чтобы календарь работал плавно
      const startDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const endDate = new Date(today.getFullYear(), today.getMonth() + 2, 0);

      const [tasksRes, notifsRes, calendarRes] = await Promise.all([
        apiService.getTasks({ page: 1, limit: 100 }),
        apiService.getNotifications({ page: 1, limit: 40 }),
        apiService.getCalendarUnified({
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          userId: crmUser.id,
          userRole: crmUser.role as any,
        })
      ]);

      if (tasksRes.success && tasksRes.data) {
        setTasks((tasksRes.data.items || []).map(mapCrmTask));
      }

      if (notifsRes.success && notifsRes.data) {
        const rawNotifs = notifsRes.data.items || [];
        
        setNotifications(rawNotifs
          .filter(n => n.type !== CrmNotificationType.REMINDER && n.type !== CrmNotificationType.NEWS)
          .map(n => ({
            id: n._id,
            type: n.priority === 'urgent' || n.priority === 'high' ? 'alert' : 'info',
            title: n.title,
            body: n.message,
            time: new Date(n.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
          }))
        );

        setNews(rawNotifs
          .filter(n => n.type === CrmNotificationType.NEWS)
          .map(n => ({
            id: n._id,
            title: n.title,
            body: n.message,
            category: 'company',
            author: 'CRM',
            publishedAt: n.createdAt.split('T')[0],
            emoji: '📢',
          }))
        );
      }

      if (calendarRes.success && calendarRes.data) {
        const crmEvents = calendarRes.data.events || [];
        const crmTasks = calendarRes.data.tasks || [];
        
        // Преобразуем задачи в формат событий, если у них есть дата начала
        const taskEvents = crmTasks
          .filter(t => t.startDate)
          .map(t => {
            const task = t as unknown as CrmTask;
            return {
              _id: task._id,
              title: task.title,
              description: task.description,
              startTime: task.startDate!,
              endTime: task.endDate || task.startDate!,
              type: 'task',
              status: task.status as any,
              createdBy: typeof task.createdBy === 'object' ? task.createdBy._id : task.createdBy,
              leadId: typeof task.leadId === 'object' ? task.leadId?._id : task.leadId,
            } as any as CrmCalendarEvent;
          });

        const allMappedEvents = [...crmEvents, ...taskEvents].map(mapCrmEvent);
        setCalendarEvents(allMappedEvents);

        setReminders(crmEvents
          .filter(e => e.type === 'reminder')
          .map(e => ({
            id: e._id,
            title: e.title,
            body: e.description,
            dueAt: e.startTime,
            done: false,
            priority: 'medium' as const,
            entityLabel: (e.taskId as any)?.title || 'Задача',
          }))
        );
      }
    } catch (error) {
      console.error('[CrmSyncContext] Background sync failed:', error);
    } finally {
      setIsLoading(false);
    }
  }, [crmUser, isAuthenticated, mapCrmTask, mapCrmEvent]);

  // Realtime updates
  useRealtimeSync({
    onTaskCreated: (t) => setTasks(prev => [mapCrmTask(t), ...prev]),
    onTaskUpdated: (t) => setTasks(prev => prev.map(old => old.id === t._id ? mapCrmTask(t) : old)),
    onTaskDeleted: (id) => setTasks(prev => prev.filter(t => t.id !== id)),
    onNotificationNew: (n) => {
      if (n.type === CrmNotificationType.NEWS) {
        setNews(prev => [{
          id: n._id,
          title: n.title,
          body: n.message,
          category: 'company',
          author: 'CRM',
          publishedAt: n.createdAt.split('T')[0],
          emoji: '📢',
        }, ...prev]);
      } else if (n.type !== CrmNotificationType.REMINDER) {
        setNotifications(prev => [{
          id: n._id,
          type: n.priority === 'urgent' || n.priority === 'high' ? 'alert' : 'info',
          title: n.title,
          body: n.message,
          time: new Date(n.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
        }, ...prev]);
      }
    },
    onCalendarEventCreated: (e) => setCalendarEvents(prev => [...prev, mapCrmEvent(e)]),
    onCalendarEventUpdated: (e) => setCalendarEvents(prev => prev.map(old => old.id === e._id ? mapCrmEvent(e) : old)),
    onCalendarEventDeleted: (id) => setCalendarEvents(prev => prev.filter(e => e.id !== id)),
  });

  useEffect(() => {
    if (isAuthenticated) {
      fetchData();
      // Periodical full refresh every 5 minutes as a fallback
      const interval = setInterval(fetchData, 5 * 60 * 1000);
      return () => clearInterval(interval);
    }
  }, [isAuthenticated, fetchData]);

  const markNotificationRead = useCallback(async (id: string) => {
    try {
      await apiService.markNotificationRead(id, true);
      setNotifications(prev => prev.filter(n => n.id !== id));
    } catch (e) {
      console.error(e);
    }
  }, []);

  const archiveReminder = useCallback(async (id: string) => {
    try {
      if (id.startsWith('reminder_')) {
        const actualId = id.replace('reminder_', '');
        await apiService.archiveNotification(actualId, true);
      }
      setReminders(prev => prev.filter(r => r.id !== id));
    } catch (e) {
      console.error(e);
    }
  }, []);

  const value = useMemo(() => ({
    tasks,
    notifications,
    reminders,
    news,
    calendarEvents,
    isLoading,
    refresh: fetchData,
    markNotificationRead,
    archiveReminder
  }), [tasks, notifications, reminders, news, calendarEvents, isLoading, fetchData, markNotificationRead, archiveReminder]);

  return (
    <CrmSyncContext.Provider value={value}>
      {children}
    </CrmSyncContext.Provider>
  );
}

export function useCrmSync() {
  const ctx = useContext(CrmSyncContext);
  if (!ctx) throw new Error('useCrmSync must be used within CrmSyncProvider');
  return ctx;
}
