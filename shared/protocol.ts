// JSON messages sent over the WebSocket between server, host and phones.
// Phase 0 only proves that the connection works; game messages come in Phase 1.

export const WS_PATH = '/ws';

export type ClientRole = 'host' | 'controller';

/** Sent by the host page or a phone. */
export type ClientMessage = { type: 'hello'; role: ClientRole };

/** Sent by the server. */
export type ServerMessage = { type: 'status'; hosts: number; controllers: number };
