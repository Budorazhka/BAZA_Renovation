import { emitAck } from './socket';
import type { ApiResponse } from './api';

export interface FileMetadata {
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
  key?: string;
}

export type EntityType = 'task' | 'note' | 'notification';

class StorageService {
  async getSignedUrl(filename: string, mimeType: string, folder: string): Promise<ApiResponse<{ key: string; folder?: string }>> {
    return emitAck<{ key: string; folder?: string }>('storage:getSignedUrl', {
      filename,
      mimeType,
      folder
    });
  }

  async attachFile(entity: EntityType, id: string, file: FileMetadata): Promise<ApiResponse<any>> {
    return emitAck('files:attach', {
      entity,
      id,
      file
    });
  }

  async getDownloadUrl(entity: EntityType, id: string, index: number): Promise<ApiResponse<{ url: string }>> {
    return emitAck<{ url: string }>('files:getDownloadUrl', {
      entity,
      id,
      index
    });
  }

  async deleteFile(entity: EntityType, id: string, index: number): Promise<ApiResponse<any>> {
    return emitAck('files:delete', {
      entity,
      id,
      index
    });
  }

  async uploadAndAttachFile(
    entity: EntityType,
    id: string,
    file: File,
    folder: string
  ): Promise<ApiResponse<any>> {
    const signedResponse = await this.getSignedUrl(file.name, file.type, folder);
    
    if (!signedResponse.success || !signedResponse.data?.key) {
      return {
        success: false,
        message: signedResponse.message || 'Failed to get signed URL'
      };
    }

    const fileMetadata: FileMetadata = {
      filename: file.name,
      originalName: file.name,
      mimeType: file.type,
      size: file.size,
      url: signedResponse.data.key,
      key: signedResponse.data.key
    };

    return this.attachFile(entity, id, fileMetadata);
  }
}

export const storageService = new StorageService();
