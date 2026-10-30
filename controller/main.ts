import { WS_PATH, type ClientMessage, type ServerMessage } from '../shared/protocol.ts';
import { TUNING } from '../shared/tuning.ts';

// Phase 0: the phone only shows whether it reached the game server.

const statusEl = document.getElementById('status')!;

function connect(): void {
  const ws = new WebSocket(`wss://${location.host}${WS_PATH}`);
  ws.addEventListener('open', () => {
    const hello: ClientMessage = { type: 'hello', role: 'controller' };
    ws.send(JSON.stringify(hello));
  });
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data) as ServerMessage;
    if (msg.type === 'status') statusEl.textContent = 'Connected to the game! ⛳';
  });
  ws.addEventListener('close', () => {
    statusEl.textContent = 'Connection lost. Reconnecting…';
    setTimeout(connect, TUNING.network.reconnectDelayMs);
  });
}
connect();
