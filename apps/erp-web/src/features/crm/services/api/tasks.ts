import type { AxiosInstance } from 'axios';
import type {
  ApiResponse,
  PaginatedResult,
  Task,
  TaskStatus,
  TaskPriority,
  TaskFile,
  Category,
  CreateTaskDto,
  UpdateTaskDto,
  Subtask,
} from './types';
import { getAuthQuery } from './client';

export type ApiContext = {
  api: AxiosInstance;
};

export function createTasksMethods(ctx: ApiContext) {
  const { api } = ctx;
  const auth = () => getAuthQuery();

  return {
    getTasks(params?: {
      page?: number;
      limit?: number;
      status?: TaskStatus;
      priority?: TaskPriority;
      assignedTo?: string;
      leadId?: string;
    }): Promise<ApiResponse<PaginatedResult<Task>>> {
      return api.get('/tasks', { params: { ...params, ...auth() } }).then((r) => r.data);
    },
    getTask(id: string): Promise<ApiResponse<Task>> {
      return api.get(`/tasks/${id}`).then((r) => r.data);
    },
    getTaskCategories(): Promise<ApiResponse<Category[]>> {
      return api.get('/tasks/getCategoryList', { params: auth() }).then((r) => r.data);
    },
    createTaskCategory(name: string, id?: number): Promise<ApiResponse<Category>> {
      return api
        .post('/tasks/categories', { name, id }, { params: auth() })
        .then((r) => r.data);
    },
    getOrCreateTaskCategory(name: string): Promise<ApiResponse<Category>> {
      return api
        .post('/tasks/categories/get-or-create', { name }, { params: auth() })
        .then((r) => r.data);
    },
    createTask(data: CreateTaskDto): Promise<ApiResponse<Task>> {
      return api.post('/tasks', data).then((r) => r.data);
    },
    updateTask(id: string, data: UpdateTaskDto): Promise<ApiResponse<Task>> {
      return api.patch(`/tasks/${id}`, data).then((r) => r.data);
    },
    deleteTask(id: string): Promise<ApiResponse<{ deleted: boolean }>> {
      return api.delete(`/tasks/${id}`).then((r) => r.data);
    },
    getArchivedTasks(params?: {
      page?: number;
      limit?: number;
      status?: TaskStatus;
      priority?: TaskPriority;
      category?: string;
      assignedTo?: string;
      leadId?: string;
    }): Promise<ApiResponse<PaginatedResult<Task>>> {
      return api.get('/tasks/archive', { params }).then((r) => r.data);
    },
    restoreTask(id: string): Promise<ApiResponse<Task>> {
      return api.patch(`/tasks/${id}/restore`).then((r) => r.data);
    },
    uploadTaskFile(
      taskId: string,
      file: File
    ): Promise<ApiResponse<{ task: Task; message: string }>> {
      const formData = new FormData();
      formData.append('file', file);
      return api
        .post(`/tasks/${taskId}/files`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        .then((r) => r.data);
    },
    async uploadTaskFilesBulk(
      taskId: string,
      files: File[]
    ): Promise<ApiResponse<{ task: Task; message: string }>> {
      let lastTask: Task | null = null;
      let successCount = 0;
      let failedCount = 0;
      for (const file of files) {
        try {
          const fd = new FormData();
          fd.append('file', file);
          const r = await api.post(`/tasks/${taskId}/files`, fd, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
          if (r.data.success && r.data.data?.task) {
            lastTask = r.data.data.task;
            successCount++;
          } else failedCount++;
        } catch {
          failedCount++;
        }
      }
      if (lastTask) {
        return {
          success: true,
          data: {
            task: lastTask,
            message: `${successCount} file(s) uploaded successfully${failedCount > 0 ? `, ${failedCount} failed` : ''}`,
          },
        } as ApiResponse<{ task: Task; message: string }>;
      }
      return {
        success: false,
        message: `Failed to upload files: ${failedCount} failed`,
      } as ApiResponse<{ task: Task; message: string }>;
    },
    getTaskFiles(taskId: string): Promise<ApiResponse<{ files: TaskFile[]; count: number }>> {
      return api.get(`/tasks/${taskId}/files`).then((r) => r.data);
    },
    deleteTaskFileByIndex(
      taskId: string,
      fileIndex: number
    ): Promise<ApiResponse<{ task: Task; message: string }>> {
      return api.delete(`/tasks/${taskId}/files/${fileIndex}`).then((r) => r.data);
    },
    deleteTaskFileByName(
      taskId: string,
      filename: string
    ): Promise<ApiResponse<{ task: Task; message: string }>> {
      return api
        .delete(`/tasks/${taskId}/files/by-name/${encodeURIComponent(filename)}`)
        .then((r) => r.data);
    },
    async addSubtask(taskId: string, subtask: Subtask): Promise<ApiResponse<Task>> {
      const taskR = await api.get(`/tasks/${taskId}`);
      if (!taskR.data.success || !taskR.data.data) throw new Error('Failed to get task');
      const current = taskR.data.data;
      const existing = (current.subtasks || []).map((st: Subtask) => ({
        title: st.title,
        completed: st.completed ?? false,
      }));
      const updated = [
        ...existing,
        { title: subtask.title, completed: subtask.completed ?? false },
      ];
      return api.patch(`/tasks/${taskId}`, { subtasks: updated }).then((r) => r.data);
    },
    async updateSubtaskStatus(
      taskId: string,
      subtaskIndex: number,
      completed: boolean
    ): Promise<ApiResponse<Task>> {
      const taskR = await api.get(`/tasks/${taskId}`);
      if (!taskR.data.success || !taskR.data.data) throw new Error('Failed to get task');
      const current = taskR.data.data;
      const normalized = (current.subtasks || []).map((st: Subtask, idx: number) => ({
        title: st.title,
        completed: idx === subtaskIndex ? completed : (st.completed ?? false),
      }));
      return api.patch(`/tasks/${taskId}`, { subtasks: normalized }).then((r) => r.data);
    },
    async deleteSubtask(
      taskId: string,
      subtaskIndex: number
    ): Promise<ApiResponse<Task>> {
      const taskR = await api.get(`/tasks/${taskId}`);
      if (!taskR.data.success || !taskR.data.data) throw new Error('Failed to get task');
      const current = taskR.data.data;
      const updated = (current.subtasks || [])
        .filter((_: Subtask, i: number) => i !== subtaskIndex)
        .map((st: Subtask) => ({ title: st.title, completed: st.completed ?? false }));
      return api.patch(`/tasks/${taskId}`, { subtasks: updated }).then((r) => r.data);
    },
    registerTaskFile(
      taskId: string,
      fileInfo: {
        url: string;
        key: string;
        filename: string;
        originalName: string;
        mimeType: string;
        size: number;
      }
    ): Promise<ApiResponse<Task>> {
      return api
        .post(`/tasks/${taskId}/files/register`, fileInfo, { params: auth() })
        .then((r) => r.data);
    },
    registerTaskFilesBulk(
      taskId: string,
      filesInfo: Array<{
        url: string;
        key: string;
        filename: string;
        originalName: string;
        mimeType: string;
        size: number;
      }>
    ): Promise<ApiResponse<Task>> {
      return api
        .post(`/tasks/${taskId}/files/register/bulk`, { files: filesInfo }, { params: auth() })
        .then((r) => r.data);
    },
  };
}
