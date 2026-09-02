declare module 'socket.io-client' {
  export type DisconnectReason = string;
  export type Socket = any;
  export function io(url: string, opts?: any): Socket;
}
