import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { SOCKET_ORIGIN } from '@/config/backend';

const WS_URL = SOCKET_ORIGIN;

let socket: Socket | null = null;
let tokenProvider: (() => string | null) | null = null;

// Push envelope type
export type PushEnvelope<T = any> = {
  eventId: string;
  ts: string; // ISO8601
  data: T;
};

// Simple dedup store and lastEventId persisted across reloads
const seenEventIds = new Set<string>();
let lastEventId: string | null = null;

const LAST_EVENT_ID_KEY = 'ws_last_event_id';
const loadLastEventId = () => {
  try {
    lastEventId = localStorage.getItem(LAST_EVENT_ID_KEY);
  } catch {}
};
const saveLastEventId = (id: string) => {
  lastEventId = id;
  try { localStorage.setItem(LAST_EVENT_ID_KEY, id); } catch {}
};

export const getLastEventId = () => lastEventId;

export const initSocket = (getToken?: () => string | null) => {
  tokenProvider = getToken || null;
  const token = tokenProvider?.() || localStorage.getItem('jwt_token') || '';
  // Socket.IO клиент сам добавит /socket.io
  socket = io(WS_URL, {
    transports: ['websocket'],
    query: token ? { token: token.startsWith('Bearer ') ? token : `Bearer ${token}` } : {},
    reconnection: true,
    reconnectionAttempts: 5, // Ограничиваем количество попыток переподключения
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 10000, // Таймаут подключения
  });

  // load last event id from storage at init
  if (!lastEventId) loadLastEventId();

  socket.on('connect', async () => {
    // Auto replay on reconnect
    try {
      await fetchReplay({ limit: 50, onlyMine: true });
    } catch (e) {
      console.warn('[ws] Replay on connect failed:', e);
    }
  });
  socket.on('connect_error', (err: Error) => {
    // eslint-disable-next-line no-console
    console.error('[ws] connection error:', err?.message || err);
  });
  socket.on('disconnect', (reason: any) => {
    // eslint-disable-next-line no-console
    console.warn('[ws] disconnected:', reason);
  });

  return socket;
};

export const getSocket = (): Socket => {
  if (!socket) {
    initSocket();
  }
  return socket as Socket;
};

export const reconnectWithToken = (newToken: string) => {
  if (!socket) return initSocket(() => newToken);
  try {
    socket.disconnect();
  } catch {}
  return initSocket(() => newToken);
};

export const emitAck = async <T = any>(
  event: string,
  payload?: any
): Promise<{ success: boolean; data?: T; message?: string; correlationId?: string }> => new Promise((resolve) => {
  const s = getSocket();
  let done = false;
  const timer = setTimeout(() => {
    if (!done) {
      done = true;
      resolve({ success: false, message: 'Ack timeout (15s)' });
    }
  }, 15000);
  try {
    s.emit(event, payload ?? {}, (resp: any) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (resp && typeof resp === 'object' && 'success' in resp) return resolve(resp);
      resolve({ success: true, data: resp });
    });
  } catch (e: any) {
    if (!done) {
      done = true;
      clearTimeout(timer);
      resolve({ success: false, message: e?.message || 'Socket emit error' });
    }
  }
});

// Subscribe with dedup by eventId and maintain lastEventId
export const onPush = <T = any>(event: string, handler: (env: PushEnvelope<T>) => void) => {
  const s = getSocket();
  const wrapped = (env: PushEnvelope<T>) => {
    if (!env || typeof env !== 'object') return;
    if (env.eventId) {
      if (seenEventIds.has(env.eventId)) return;
      seenEventIds.add(env.eventId);
      saveLastEventId(env.eventId);
    }
    try {
      handler(env);
    } catch (e) {
      console.error('[ws] push handler error:', e);
    }
  };
  s.on(event, wrapped as any);
  return wrapped; // return actual listener for off
};

export const offPush = (event: string, listener: (...args: any[]) => void) => {
  const s = getSocket();
  s.off(event, listener);
};

// Request replay events since lastEventId (best-effort). Returns array of { event, envelope }
export const fetchReplay = async (opts?: { sinceTs?: string; lastEventId?: string; rooms?: string[]; onlyMine?: boolean; limit?: number }) => {
  const payload: any = {};
  if (opts?.sinceTs) payload.since = opts.sinceTs;
  if (opts?.lastEventId ?? lastEventId) payload.lastEventId = opts?.lastEventId ?? lastEventId;
  if (opts?.rooms) payload.rooms = opts.rooms;
  if (typeof opts?.onlyMine === 'boolean') payload.onlyMine = opts.onlyMine; else payload.onlyMine = true;
  if (opts?.limit) payload.limit = opts.limit;
  const resp = await emitAck<any>('events:replay', payload);
  if (resp.success && resp.data && Array.isArray((resp.data as any).events)) {
    return (resp.data as any).events as Array<{ event: string; envelope: PushEnvelope<any> }>;
  }
  return [] as Array<{ event: string; envelope: PushEnvelope<any> }>;
};

export const subscribeRooms = async (rooms: string[] | { type: 'task'|'lead'|'org', id: string }[]) => {
  const payload = Array.isArray(rooms) ? { rooms } : rooms;
  return emitAck('rooms:subscribe', payload);
};

export const unsubscribeRooms = async (rooms: string[] | { type: 'task'|'lead'|'org', id: string }[]) => {
  const payload = Array.isArray(rooms) ? { rooms } : rooms;
  return emitAck('rooms:unsubscribe', payload);
};
