import { io, Socket } from 'socket.io-client';
import { MESSENGERS_SOCKET_URL } from '@/config/backend';

let socket: Socket | null = null;

export const getMessengerSocket = (): Socket => {
  if (!socket) {
    socket = io(MESSENGERS_SOCKET_URL, {
      transports: ['websocket'],
      autoConnect: true,
    });

    socket.on('connect', () => {
      const currentToken = localStorage.getItem('msgr_jwt_token');
      if (currentToken) {
        socket?.emit('authenticate', { token: currentToken });
      } else {
        console.warn('[Messenger Socket] No token found for authentication');
      }
    });

    socket.on('disconnect', () => {
    });

    socket.on('error', (error: any) => {
      console.error('[Messenger Socket] Error:', error);
    });
  }
  return socket;
};

export const authenticateMessengerSocket = () => {
  const currentToken = localStorage.getItem('msgr_jwt_token');
  if (!socket || !currentToken) return;
  socket.emit('authenticate', { token: currentToken });
};

export const disconnectMessengerSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};
