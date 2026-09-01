import { useEffect, useRef, useCallback } from 'react';
import { onPush, offPush } from '../services/socket';
import type { PushEnvelope } from '../services/socket';
import type { FileMetadata } from '../services/storageService';

export interface FileEventOptions {
  onFileAttached?: (data: { entity: string; id: string; file: FileMetadata }) => void;
  onFileDeleted?: (data: { entity: string; id: string; index: number }) => void;
  onError?: (error: Error) => void;
}

export const useFileEvents = (options: FileEventOptions) => {
  const listenersRef = useRef<Array<{ event: string; fn: (env: PushEnvelope<any>) => void }>>([]);
  const mountedRef = useRef(true);

  const subscribe = useCallback(<T,>(event: string, handler: (data: T) => void) => {
    const wrapped = (env: PushEnvelope<T>) => {
      try {
        if (env?.data) handler(env.data);
      } catch (e) {
        options.onError?.(e instanceof Error ? e : new Error(String(e)));
      }
    };
    const listener = onPush<T>(event, wrapped);
    listenersRef.current.push({ event, fn: listener });
    return listener;
  }, [options]);

  useEffect(() => {
    if (!mountedRef.current) return;

    subscribe<{ entity: string; id: string; file: FileMetadata }>('files:attached', (data) => {
      if (mountedRef.current) options.onFileAttached?.(data);
    });

    subscribe<{ entity: string; id: string; index: number }>('files:deleted', (data) => {
      if (mountedRef.current) options.onFileDeleted?.(data);
    });

    return () => {
      mountedRef.current = false;
      listenersRef.current.forEach(({ event, fn }) => {
        offPush(event, fn);
      });
      listenersRef.current = [];
    };
  }, [subscribe, options]);
};
