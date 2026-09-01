import { useEffect, useState, useCallback } from 'react';
import { apiService, TaskPriority, TaskStatus } from '../../../services/api';
import type { Task, Lead } from '../../../services/api';
import { useTaskSync } from '../../../hooks/useTaskSync';
import { useLeadSync } from '../../../hooks/useLeadSync';
import { useTaskRealtimeSync } from '../../../hooks/useTaskRealtimeSync';
import { useLeadRealtimeSync } from '../../../hooks/useLeadRealtimeSync';

export interface UseCrmDataParams {
  isAuthenticated: boolean;
}

export function useCrmData({ isAuthenticated }: UseCrmDataParams) {
  const taskSync = useTaskSync();
  const leadSync = useLeadSync();
  const backendTasks = taskSync.tasks;
  const backendLeads = leadSync.leads;

  const [dataLoading, setDataLoading] = useState(true);
  const [lastUpdateTime, setLastUpdateTime] = useState<Date>(new Date());
  const [isDataLoading, setIsDataLoading] = useState(false);
  const [taskCategoriesMap, setTaskCategoriesMap] = useState<Map<number, string>>(new Map());
  const [, setLeadsMap] = useState<Map<string, Lead>>(new Map());

  const loadTasks = useCallback(async (leadId?: string) => {
    try {
      const response = await apiService.getTasks({ page: 1, limit: 50, leadId });
      if (response.success && response.data) {
        taskSync.syncWithBackend(response.data.items);
      }
    } catch {
      // ignore
    }
  }, [taskSync]);

  const loadLeads = useCallback(async () => {
    try {
      const response = await apiService.getLeads({ page: 1, limit: 1000 });
      if (response.success && response.data) {
        leadSync.syncWithBackend(response.data.items);
      }
    } catch {
      // ignore
    }
  }, [leadSync]);

  useEffect(() => {
    if (!isAuthenticated) {
      setDataLoading(false);
      return;
    }
    let cancelled = false;
    const loadTaskCategories = async (): Promise<Map<number, string>> => {
      const response = await apiService.getTaskCategories();
      if (!response.success || !response.data) return new Map();
      const map = new Map<number, string>();
      response.data.forEach((cat: { id: number; name: string }) => map.set(cat.id, cat.name));
      const quickCategories = ['Задача дня', 'Срочные', 'Личные дела', 'Спорт'];
      for (const categoryName of quickCategories) {
        if (!Array.from(map.values()).includes(categoryName)) {
          try {
            const createResponse = await apiService.getOrCreateTaskCategory(categoryName);
            if (createResponse.success && createResponse.data) {
              map.set(createResponse.data.id, createResponse.data.name);
            }
          } catch (error) {
            console.error(`Ошибка создания категории ${categoryName}:`, error);
          }
        }
      }
      return map;
    };
    const loadLeadsMap = async (): Promise<Map<string, Lead>> => {
      const leadsResponse = await apiService.getLeads({ page: 1, limit: 1000 });
      if (!leadsResponse.success || !leadsResponse.data) return new Map();
      const map = new Map<string, Lead>();
      leadsResponse.data.items.forEach((lead: Lead) => map.set(lead._id, lead));
      return map;
    };
    (async () => {
      try {
        setDataLoading(true);
        await Promise.all([loadTasks(), loadLeads()]);
        if (cancelled) return;
        const [categories, leadsMap] = await Promise.all([loadTaskCategories(), loadLeadsMap()]);
        if (cancelled) return;
        setTaskCategoriesMap(categories);
        setLeadsMap(leadsMap);
      } catch {
        // ignore
      } finally {
        if (!cancelled) setDataLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // Запускаем только при смене авторизации; loadTasks/loadLeads намеренно не в deps,
    // иначе эффект перезапускается каждый рендер (taskSync/leadSync — новые объекты) и dataLoading не сбрасывается.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  const handleDeleteTask = useCallback(async (taskId: string) => {
    if (!taskId) throw new Error('Task ID is required');
    let taskTitle = '';
    let taskLeadId: string | undefined;
    try {
      const taskResponse = await apiService.getTask(taskId);
      if (taskResponse.success && taskResponse.data) {
        taskTitle = taskResponse.data.title;
        const leadId = taskResponse.data.leadId;
        if (typeof leadId === 'string') taskLeadId = leadId;
        else if (leadId && typeof leadId === 'object') taskLeadId = (leadId as { _id?: string; id?: string })._id || (leadId as { _id?: string; id?: string }).id;
      }
    } catch (error) {
      console.error('Failed to get task before deletion:', error);
    }
    taskSync.removeTask(taskId);
    try {
      const response = await apiService.deleteTask(taskId);
      if (response.success && taskLeadId && taskTitle) {
        try {
          await apiService.addLeadHistoryEntry(taskLeadId, { message: `Задача "${taskTitle}" удалена` });
        } catch (error) {
          console.error('Failed to add history entry:', error);
        }
      } else if (!response.success) {
        const loadTasksResponse = await apiService.getTasks({ page: 1, limit: 50 });
        if (loadTasksResponse.success && loadTasksResponse.data) {
          taskSync.syncWithBackend(loadTasksResponse.data.items);
        }
        throw new Error(response.message || 'Не удалось удалить задачу на сервере');
      }
    } catch (error) {
      try {
        const loadTasksResponse = await apiService.getTasks({ page: 1, limit: 50 });
        if (loadTasksResponse.success && loadTasksResponse.data) {
          taskSync.syncWithBackend(loadTasksResponse.data.items);
        }
      } catch {
        // ignore
      }
      throw error;
    }
  }, [taskSync]);

  const handleTaskUpdate = useCallback(async (updatedTask: Task) => {
    taskSync.updateTaskAfterSync(updatedTask._id, updatedTask);
    let taskLeadId: string | undefined;
    if (typeof updatedTask.leadId === 'string') taskLeadId = updatedTask.leadId;
    else if (updatedTask.leadId && typeof updatedTask.leadId === 'object') {
      const o = updatedTask.leadId as { _id?: string; id?: string };
      taskLeadId = o._id || o.id;
    } else taskLeadId = undefined;
    if (taskLeadId && updatedTask.title) {
      try {
        await apiService.addLeadHistoryEntry(taskLeadId, { message: `Задача "${updatedTask.title}" изменена` });
      } catch (error) {
        console.error('Failed to add history entry:', error);
      }
    }
  }, [taskSync]);

  const handleTaskRestored = useCallback(async (restoredTask: Task) => {
    taskSync.addTask(restoredTask);
    setLastUpdateTime(new Date());
    await handleTaskUpdate(restoredTask);
    await loadTasks();
    setLastUpdateTime(new Date());
  }, [taskSync, handleTaskUpdate, loadTasks]);

  const handleUpdateLeads = useCallback((updatedLeads: Lead[]) => {
    leadSync.syncWithBackend(updatedLeads);
  }, [leadSync]);

  const handleUpdateLead = useCallback((leadId: string, updates: Partial<Lead>, modifiedFields: string[]) => {
    leadSync.updateLead(leadId, updates, modifiedFields);
  }, [leadSync]);

  const handleUpdateLeadAfterSync = useCallback((leadId: string, syncedLead: Lead) => {
    leadSync.updateLeadAfterSync(leadId, syncedLead);
  }, [leadSync]);

  const handleLeadDeleted = useCallback(async (leadId: string) => {
    leadSync.removeLead(leadId);
    await loadLeads();
  }, [leadSync, loadLeads]);

  const refreshData = useCallback(async (showLoader = false) => {
    if (showLoader) setIsDataLoading(true);
    try {
      const [tasksResponse, leadsResponse] = await Promise.all([
        apiService.getTasks({ page: 1, limit: 50 }),
        apiService.getLeads({ page: 1, limit: 1000 }),
      ]);
      if (tasksResponse.success && tasksResponse.data) {
        taskSync.syncWithBackend(tasksResponse.data.items || []);
      }
      if (leadsResponse.success && leadsResponse.data) {
        leadSync.syncWithBackend(leadsResponse.data.items || []);
      }
      setLastUpdateTime(new Date());
    } catch {
      // ignore
    } finally {
      if (showLoader) setIsDataLoading(false);
    }
  }, [taskSync, leadSync]);

  useTaskRealtimeSync({
    onTaskCreated: (task) => {
      taskSync.addTask(task);
      setLastUpdateTime(new Date());
    },
    onTaskUpdated: (task) => {
      taskSync.updateTaskAfterSync(task._id, task);
      setLastUpdateTime(new Date());
    },
    onTaskDeleted: (id) => {
      taskSync.removeTask(id);
      setLastUpdateTime(new Date());
    },
    onTasksReload: () => loadTasks(),
    fallbackInterval: 5000,
  });

  useLeadRealtimeSync({
    onLeadCreated: (lead) => {
      leadSync.addLead(lead);
      setLastUpdateTime(new Date());
    },
    onLeadUpdated: (lead) => {
      leadSync.updateLeadAfterSync(lead._id, lead);
      setLastUpdateTime(new Date());
    },
    onLeadDeleted: () => setLastUpdateTime(new Date()),
    onLeadsReload: () => loadLeads(),
    fallbackInterval: 5000,
  });

  const updateTaskStatus = useCallback(async (taskId: string, status: TaskStatus) => {
    taskSync.updateTask(taskId, { status } as Partial<Task>, ['status']);
    try {
      const response = await apiService.updateTask(taskId, { status });
      if (response.success && response.data) {
        taskSync.updateTaskAfterSync(taskId, response.data);
        const updatedTask = response.data;
        let taskLeadId: string | undefined;
        if (typeof updatedTask.leadId === 'string') taskLeadId = updatedTask.leadId;
        else if (updatedTask.leadId && typeof updatedTask.leadId === 'object') {
          const o = updatedTask.leadId as { _id?: string; id?: string };
          taskLeadId = o._id || o.id;
        } else taskLeadId = undefined;
        if (taskLeadId && updatedTask.title) {
          try {
            await apiService.addLeadHistoryEntry(taskLeadId, { message: `Задача "${updatedTask.title}" изменена` });
          } catch (error) {
            console.error('Failed to add history entry:', error);
          }
        }
      } else {
        await loadTasks();
      }
    } catch {
      await loadTasks();
    }
  }, [taskSync, loadTasks]);

  const updateTaskPriority = useCallback(async (taskId: string, priority: TaskPriority) => {
    taskSync.updateTask(taskId, { priority } as Partial<Task>, ['priority']);
    try {
      const response = await apiService.updateTask(taskId, { priority });
      if (response.success && response.data) {
        taskSync.updateTaskAfterSync(taskId, response.data);
      } else {
        await loadTasks();
      }
    } catch {
      await loadTasks();
    }
  }, [taskSync, loadTasks]);

  const updateTaskEndDate = useCallback(async (taskId: string, endDate: string | undefined) => {
    taskSync.updateTask(taskId, { endDate } as Partial<Task>, ['endDate']);
    try {
      const updateData: { endDate?: string } = {};
      if (endDate) updateData.endDate = endDate;
      const response = await apiService.updateTask(taskId, updateData);
      if (response.success && response.data) {
        taskSync.updateTaskAfterSync(taskId, response.data);
      } else {
        await loadTasks();
      }
    } catch {
      await loadTasks();
    }
  }, [taskSync, loadTasks]);

  return {
    taskSync,
    leadSync,
    backendTasks,
    backendLeads,
    taskCategoriesMap,
    setTaskCategoriesMap,
    dataLoading,
    setDataLoading,
    lastUpdateTime,
    setLastUpdateTime,
    isDataLoading,
    setIsDataLoading,
    loadTasks,
    loadLeads,
    handleDeleteTask,
    handleTaskUpdate,
    handleTaskRestored,
    handleUpdateLeads,
    handleUpdateLead,
    handleUpdateLeadAfterSync,
    handleLeadDeleted,
    refreshData,
    updateTaskStatus,
    updateTaskPriority,
    updateTaskEndDate,
  };
}

export type UseCrmDataReturn = ReturnType<typeof useCrmData>;
