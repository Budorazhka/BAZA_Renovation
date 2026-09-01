import { useState, useEffect } from 'react';
import { getSocket } from '../services/socket';
import type { Socket } from 'socket.io-client';

export type ConnectionMode = 'websocket' | 'http';

export interface UseSocketConnectionReturn {
  isConnected: boolean;
  mode: ConnectionMode;
  socket: Socket | null;
}

/**
 * Хук для отслеживания состояния WebSocket соединения
 * Возвращает информацию о подключении и текущий режим работы
 */
export function useSocketConnection(): UseSocketConnectionReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [mode, setMode] = useState<ConnectionMode>('http');

  useEffect(() => {
    let socket: Socket | null = null;
    let connectionTimeout: ReturnType<typeof setTimeout> | null = null;
    
    try {
      socket = getSocket();
    } catch (error) {
      console.warn('[ws] Failed to get socket:', error);
      setMode('http');
      setIsConnected(false);
      return;
    }

    if (!socket) {
      setMode('http');
      setIsConnected(false);
      return;
    }

    // Инициализация состояния - по умолчанию считаем, что не подключены
    // Socket.IO будет пытаться подключиться, но пока не подключен - используем HTTP
    setIsConnected(false);
    setMode('http');

    // Устанавливаем таймаут - если за 3 секунды не подключились, считаем что не подключены
    connectionTimeout = setTimeout(() => {
      if (!socket?.connected) {
        setIsConnected(false);
        setMode('http');
      }
    }, 3000);

    // Обработчики событий
    const handleConnect = () => {
      if (connectionTimeout) {
        clearTimeout(connectionTimeout);
        connectionTimeout = null;
      }
      setIsConnected(true);
      setMode('websocket');
    };

    const handleDisconnect = () => {
      setIsConnected(false);
      setMode('http');
    };

    const handleConnectError = () => {
      console.warn('[ws] Connection error - using HTTP fallback');
      if (connectionTimeout) {
        clearTimeout(connectionTimeout);
        connectionTimeout = null;
      }
      setIsConnected(false);
      setMode('http');
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleConnectError);

    // Если уже подключен при инициализации
    if (socket.connected) {
      if (connectionTimeout) {
        clearTimeout(connectionTimeout);
        connectionTimeout = null;
      }
      setIsConnected(true);
      setMode('websocket');
    }

    // Очистка
    return () => {
      if (connectionTimeout) {
        clearTimeout(connectionTimeout);
      }
      if (socket) {
        socket.off('connect', handleConnect);
        socket.off('disconnect', handleDisconnect);
        socket.off('connect_error', handleConnectError);
      }
    };
  }, []);

  return {
    isConnected,
    mode,
    socket: isConnected ? getSocket() : null,
  };
}

