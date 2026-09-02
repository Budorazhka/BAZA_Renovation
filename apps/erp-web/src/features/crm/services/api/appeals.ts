import type { AxiosInstance } from 'axios';
import type { ApiResponse, Appeal, CreateAppealDto } from './types';
import { getAuthQuery } from './client';

export type ApiContext = {
  api: AxiosInstance;
};

export function createAppealsMethods(ctx: ApiContext) {
  const { api } = ctx;
  const auth = () => getAuthQuery();

  return {
    uploadFile(file: File): Promise<ApiResponse<{ url: string }>> {
      const fd = new FormData();
      fd.append('file', file);
      return api
        .post('/files/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
        .then((r) => r.data);
    },
    uploadAppealFile(
      file: File
    ): Promise<ApiResponse<{ url: string; filename?: string; size?: number; mimeType?: string }>> {
      const fd = new FormData();
      fd.append('file', file);
      return api
        .post('/files/upload', fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
          params: auth(),
        })
        .then((r) => {
          const d = r.data;
          if (!d?.success || !d?.data?.file) {
            return { success: false, message: d?.message || 'Upload failed' } as ApiResponse<any>;
          }
          const f = d.data.file;
          return {
            success: true,
            data: {
              url: f.url,
              filename: f.filename || f.originalName,
              size: f.size,
              mimeType: f.mimetype,
            },
          } as ApiResponse<{ url: string; filename?: string; size?: number; mimeType?: string }>;
        });
    },
    uploadAppealFileFallback(
      file: File
    ): Promise<ApiResponse<{ url: string; filename: string; size: number; mimeType: string }>> {
      const { userId } = auth();
      const fd = new FormData();
      fd.append('file', file);
      return api
        .post('/files/upload', fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
          params: userId ? { userId } : undefined,
        })
        .then((r) => {
          const d = r.data;
          if (!d?.success || !d?.data?.file) {
            return { success: false, message: d?.message || 'Upload failed' } as ApiResponse<any>;
          }
          const f = d.data.file;
          return {
            success: true,
            data: {
              url: f.cdnUrl || f.url,
              filename: f.filename || f.originalName,
              size: f.size,
              mimeType: f.mimeType,
            },
          } as ApiResponse<{ url: string; filename: string; size: number; mimeType: string }>;
        });
    },
    createAppeal(data: CreateAppealDto): Promise<ApiResponse<Appeal>> {
      const requestData: any = {
        type: String(data.type),
        text: data.text,
        urgency: data.urgency ? String(data.urgency) : 'medium',
        userId: data.userId,
        userEmail: data.userEmail,
      };
      if (data.attachments?.length) requestData.attachments = data.attachments;
      if (data.contactInfo && Object.keys(data.contactInfo).length)
        requestData.contactInfo = data.contactInfo;
      return api
        .post('/appeals', requestData, { params: auth() })
        .then((r) => r.data);
    },
  };
}
