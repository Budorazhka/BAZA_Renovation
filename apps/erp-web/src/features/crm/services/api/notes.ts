import type { AxiosInstance } from 'axios';
import type {
  ApiResponse,
  PaginatedResult,
  Note,
  CreateNoteDto,
  UpdateNoteDto,
  Category,
} from './types';
import { getAuthQuery } from './client';

export type ApiContext = {
  api: AxiosInstance;
};

export function createNotesMethods(ctx: ApiContext) {
  const { api } = ctx;
  const auth = () => getAuthQuery();

  return {
    createNote(data: CreateNoteDto): Promise<ApiResponse<Note>> {
      return api.post('/notes', data, { params: auth() }).then((r) => r.data);
    },
    getNotes(params?: {
      page?: number;
      limit?: number;
      isPinned?: boolean;
      leadId?: string;
      taskId?: string;
      search?: string;
    }): Promise<ApiResponse<PaginatedResult<Note>>> {
      return api.get('/notes', { params: { ...params, ...auth() } }).then((r) => r.data);
    },
    getNote(id: string): Promise<ApiResponse<Note>> {
      return api.get(`/notes/${id}`, { params: auth() }).then((r) => r.data);
    },
    getNoteCategories(): Promise<ApiResponse<Category[]>> {
      return api.get('/notes/getCategoryList', { params: auth() }).then((r) => r.data);
    },
    createNoteCategory(name: string, id?: number): Promise<ApiResponse<Category>> {
      return api.post('/notes/categories', { name, id }, { params: auth() }).then((r) => r.data);
    },
    getOrCreateNoteCategory(name: string): Promise<ApiResponse<Category>> {
      return api
        .post('/notes/categories/get-or-create', { name }, { params: auth() })
        .then((r) => r.data);
    },
    updateNote(id: string, data: UpdateNoteDto): Promise<ApiResponse<Note>> {
      return api.patch(`/notes/${id}`, data, { params: auth() }).then((r) => r.data);
    },
    deleteNote(id: string): Promise<ApiResponse<{ deleted: boolean }>> {
      return api.delete(`/notes/${id}`, { params: auth() }).then((r) => r.data);
    },
    pinNote(id: string, isPinned: boolean): Promise<ApiResponse<Note>> {
      return api.patch(`/notes/${id}/pin`, { isPinned }, { params: auth() }).then((r) => r.data);
    },
    uploadNoteFile(noteId: string, file: File): Promise<ApiResponse<Note>> {
      const fd = new FormData();
      fd.append('file', file);
      return api
        .post(`/notes/${noteId}/files`, fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
          params: auth(),
        })
        .then((r) => r.data);
    },
    async uploadNoteFilesBulk(noteId: string, files: File[]): Promise<ApiResponse<Note>> {
      let lastNote: Note | null = null;
      let successCount = 0;
      let failedCount = 0;
      for (const file of files) {
        try {
          const fd = new FormData();
          fd.append('file', file);
          const r = await api.post(`/notes/${noteId}/files`, fd, {
            headers: { 'Content-Type': 'multipart/form-data' },
            params: auth(),
          });
          if (r.data.success && r.data.data) {
            lastNote = r.data.data;
            successCount++;
          } else failedCount++;
        } catch {
          failedCount++;
        }
      }
      if (lastNote) {
        return {
          success: true,
          data: lastNote,
          message: `${successCount} file(s) uploaded${failedCount > 0 ? `, ${failedCount} failed` : ''}`,
        } as ApiResponse<Note>;
      }
      return {
        success: false,
        message: `Failed: ${failedCount} failed`,
      } as ApiResponse<Note>;
    },
    deleteNoteFileByIndex(noteId: string, fileIndex: number): Promise<ApiResponse<Note>> {
      return api
        .delete(`/notes/${noteId}/files/${fileIndex}`, { params: auth() })
        .then((r) => r.data);
    },
    getNoteFile(noteId: string, fileIndex: number): Promise<Blob> {
      return api
        .get(`/notes/${noteId}/files/${fileIndex}`, {
          params: auth(),
          responseType: 'blob',
        })
        .then((r) => r.data);
    },
    registerNoteFile(
      noteId: string,
      fileInfo: {
        url: string;
        key: string;
        filename: string;
        originalName: string;
        mimeType: string;
        size: number;
      }
    ): Promise<ApiResponse<Note>> {
      return api
        .post(`/notes/${noteId}/files/register`, fileInfo, { params: auth() })
        .then((r) => r.data);
    },
    registerNoteFilesBulk(
      noteId: string,
      filesInfo: Array<{
        url: string;
        key: string;
        filename: string;
        originalName: string;
        mimeType: string;
        size: number;
      }>
    ): Promise<ApiResponse<Note>> {
      return api
        .post(`/notes/${noteId}/files/register/bulk`, { files: filesInfo }, { params: auth() })
        .then((r) => r.data);
    },
  };
}
