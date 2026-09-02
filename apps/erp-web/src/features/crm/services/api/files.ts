import type { ApiResponse } from './types';

export type FilesContext = {
  uploadTaskFile: (taskId: string, file: File) => Promise<ApiResponse<{ task: any; message: string }>>;
  uploadLeadFile: (leadId: string, file: File) => Promise<ApiResponse<{ lead: any; message: string }>>;
  uploadNoteFile: (noteId: string, file: File) => Promise<ApiResponse<any>>;
  uploadTaskFilesBulk: (taskId: string, files: File[]) => Promise<ApiResponse<{ task: any; message: string }>>;
  uploadLeadFilesBulk: (leadId: string, files: File[]) => Promise<ApiResponse<{ lead: any; message: string }>>;
  uploadNoteFilesBulk: (noteId: string, files: File[]) => Promise<ApiResponse<any>>;
};

export function createFilesMethods(ctx: FilesContext) {
  const {
    uploadTaskFile,
    uploadLeadFile,
    uploadNoteFile,
    uploadTaskFilesBulk,
    uploadLeadFilesBulk,
    uploadNoteFilesBulk,
  } = ctx;

  return {
    async uploadAndRegisterFile(
      file: File,
      entityType: 'task' | 'lead' | 'note',
      entityId: string,
      _folder?: string
    ): Promise<
      ApiResponse<{
        url: string;
        key: string;
        filename: string;
        originalName: string;
        mimeType: string;
        size: number;
      }>
    > {
      try {
        let response: ApiResponse<any>;
        if (entityType === 'task') response = await uploadTaskFile(entityId, file);
        else if (entityType === 'lead') response = await uploadLeadFile(entityId, file);
        else if (entityType === 'note') response = await uploadNoteFile(entityId, file);
        else return { success: false, message: 'Unknown entity type' } as ApiResponse<any>;
        if (!response.success)
          return { success: false, message: response.message || 'Failed to upload file' } as ApiResponse<any>;
        const uploadedFile =
          response.data?.task?.files?.[response.data.task.files?.length - 1] ||
          response.data?.lead?.files?.[response.data.lead.files?.length - 1] ||
          response.data?.files?.[response.data.files?.length - 1];
        if (!uploadedFile)
          return { success: false, message: 'File info not found in response' } as ApiResponse<any>;
        return {
          success: true,
          data: {
            url: uploadedFile.url,
            key: uploadedFile.key || uploadedFile.url,
            filename: uploadedFile.filename || uploadedFile.originalName,
            originalName: uploadedFile.originalName || uploadedFile.filename,
            mimeType: uploadedFile.mimeType || uploadedFile.mimetype,
            size: uploadedFile.size,
          },
        };
      } catch (e: any) {
        return { success: false, message: e.message || 'Upload failed' } as ApiResponse<any>;
      }
    },
    async uploadAndRegisterFilesBulk(
      files: File[],
      entityType: 'task' | 'lead' | 'note',
      entityId: string,
      _folder?: string
    ): Promise<
      ApiResponse<
        Array<{
          url: string;
          key: string;
          filename: string;
          originalName: string;
          mimeType: string;
          size: number;
        }>
      >
    > {
      try {
        let response: ApiResponse<any>;
        if (entityType === 'task') response = await uploadTaskFilesBulk(entityId, files);
        else if (entityType === 'lead') response = await uploadLeadFilesBulk(entityId, files);
        else if (entityType === 'note') response = await uploadNoteFilesBulk(entityId, files);
        else return { success: false, message: 'Unknown entity type' } as ApiResponse<any>;
        if (!response.success)
          return { success: false, message: response.message || 'Failed to upload files' } as ApiResponse<any>;
        const uploadedFiles =
          response.data?.task?.files?.slice(-files.length) ||
          response.data?.lead?.files?.slice(-files.length) ||
          response.data?.files?.slice(-files.length) ||
          [];
        if (uploadedFiles.length === 0)
          return { success: false, message: 'File info not found' } as ApiResponse<any>;
        return {
          success: true,
          data: uploadedFiles.map((file: any) => ({
            url: file.url,
            key: file.key || file.url,
            filename: file.filename || file.originalName,
            originalName: file.originalName || file.filename,
            mimeType: file.mimeType || file.mimetype,
            size: file.size,
          })),
        };
      } catch (e: any) {
        return { success: false, message: e.message || 'Upload failed' } as ApiResponse<any>;
      }
    },
  };
}
