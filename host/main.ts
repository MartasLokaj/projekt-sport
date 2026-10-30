import { MAX_PLAYERS, WS_PATH, type ClientMessage, type PlayerInfo, type ServerMessage } from '../shared/protocol.ts';
import { TUNING } from '../shared/tuning.ts';

// Phase 1a: the lobby. Shows the QR code and the players who joined from their phones.

const qrEl = document.getElementById('qr') as HTMLImageElement;
const joinUrlEl = document.getElementById('join-url')!;
const roomCodeEl = document.getElementById('room-code')!;
const playersEl = document.getElementById('players')!;
const offlineBanner = document.getElementById('offline-banner')!;

function showHostInfo(msg: Extract<ServerMessage, { type: 'host_info' }>): void {
  roomCodeEl.textContent = msg.room;
  if (msg.qrDataUrl && msg.joinUrl) {
    qrEl.src = msg.qrDataUrl;
    qrEl.hidden = false;
    joinUrlEl.textContent = `or open ${msg.joinUrl.split('?')[0]} and type the code`;
  } else {
    qrEl.hidden = true;
    joinUrlEl.textContent = 'This computer is not connected to a Wi-Fi network, so phones cannot join.';
  }
}

function showPlayers(players: PlayerInfo[]): void {
  playersEl.replaceChildren();
  for (let i = 0; i < MAX_PLAYERS; i++) {
    const player = players[i];
    const card = document.createElement('div');
    const dot = document.createElement('div');
    const label = document.createElement('div');
    card.className = 'player';
    dot.className = 'dot';
    if (player) {
      dot.style.background = player.colour;
      label.textContent = player.name;
      const state = document.createElement('span');
      state.className = 'state';
      state.textContent = player.connected ? 'Ready' : 'Phone disconnected…';
      label.append(state);
      if (!player.connected) card.classList.add('offline');
    } else {
      card.classList.add('empty');
      label.textContent = 'Waiting for player…';
    }
    card.append(dot, label);
    playersEl.append(card);
  }
}

function connect(): void {
  const ws = new WebSocket(`wss://${location.host}${WS_PATH}`);
  ws.addEventListener('open', () => {
    offlineBanner.hidden = true;
    const hello: ClientMessage = { type: 'host_hello' };
    ws.send(JSON.stringify(hello));
  });
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data) as ServerMessage;
    if (msg.type === 'host_info') showHostInfo(msg);
    else if (msg.type === 'lobby_state') showPlayers(msg.players);
  });
  ws.addEventListener('close', () => {
    offlineBanner.hidden = false;
    setTimeout(connect, TUNING.network.reconnectDelayMs);
  });
}

showPlayers([]);
connect();
