import {
  MAX_PLAYERS,
  WS_PATH,
  type ClientMessage,
  type PlayerInfo,
  type ServerMessage,
  type Stroke,
} from '../shared/protocol.ts';
import { TUNING } from '../shared/tuning.ts';

// Phase 1: the lobby. Shows the QR code and the players who joined from their phones,
// with a live readout of each phone's aim and the power of its last hit.

const qrEl = document.getElementById('qr') as HTMLImageElement;
const joinUrlEl = document.getElementById('join-url')!;
const roomCodeEl = document.getElementById('room-code')!;
const playersEl = document.getElementById('players')!;
const offlineBanner = document.getElementById('offline-banner')!;

type Readout = { angle: number; stroke: Stroke | null };
type CardRefs = { card: HTMLElement; arrow: HTMLElement; aimText: HTMLElement; powerFill: HTMLElement; powerText: HTMLElement; detail: HTMLElement };

/** Latest aim and hit per player id, kept when the cards are rebuilt. */
const readouts = new Map<string, Readout>();
const cards = new Map<string, CardRefs>();

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

function el(tag: string, className: string, text = ''): HTMLElement {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = text;
  return element;
}

function showPlayers(players: PlayerInfo[]): void {
  playersEl.replaceChildren();
  cards.clear();
  for (let i = 0; i < MAX_PLAYERS; i++) {
    const player = players[i];
    const card = el('div', 'player');
    const dot = el('div', 'dot');
    const info = el('div', 'info');
    if (player) {
      dot.style.background = player.colour;
      info.append(el('div', 'name', player.name), el('div', 'state', player.connected ? 'Ready' : 'Phone disconnected…'));
      if (!player.connected) card.classList.add('offline');

      const refs: CardRefs = {
        card,
        arrow: el('span', 'arrow', '▲'),
        aimText: el('span', 'aim-text'),
        powerFill: el('div', 'power-fill'),
        powerText: el('span', 'power-text'),
        detail: el('div', 'detail'),
      };
      const aim = el('div', 'aim');
      aim.append(refs.arrow, refs.aimText);
      const bar = el('div', 'power-bar');
      bar.append(refs.powerFill, refs.powerText);
      info.append(aim, bar, refs.detail);
      cards.set(player.id, refs);
      renderReadout(player.id);
    } else {
      card.classList.add('empty');
      info.append(el('div', 'name', 'Waiting for player…'));
    }
    card.append(dot, info);
    playersEl.append(card);
  }
}

function readoutOf(playerId: string): Readout {
  let readout = readouts.get(playerId);
  if (!readout) {
    readout = { angle: 0, stroke: null };
    readouts.set(playerId, readout);
  }
  return readout;
}

function renderReadout(playerId: string): void {
  const refs = cards.get(playerId);
  if (!refs) return;
  const { angle, stroke } = readoutOf(playerId);
  refs.arrow.style.transform = `rotate(${angle}deg)`;
  refs.aimText.textContent = `Aim ${Math.round(angle)}°`;
  refs.powerFill.style.width = `${stroke?.power ?? 0}%`;
  refs.powerText.textContent = stroke ? `Last hit: ${Math.round(stroke.power)}%` : 'No hit yet';
  refs.detail.textContent = !stroke
    ? ''
    : stroke.mode === 'slingshot'
      ? 'Touch controls'
      : `Swing · peak ${stroke.peakRate}°/s · axis ${stroke.axis}`;
}

function flash(card: HTMLElement): void {
  card.classList.remove('hit');
  void card.offsetWidth; // restart the animation
  card.classList.add('hit');
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
    else if (msg.type === 'player_aim') {
      readoutOf(msg.playerId).angle = msg.angle;
      renderReadout(msg.playerId);
    } else if (msg.type === 'player_stroke') {
      const { type: _type, playerId, ...stroke } = msg;
      readoutOf(playerId).stroke = stroke;
      renderReadout(playerId);
      const refs = cards.get(playerId);
      if (refs) flash(refs.card);
    }
  });
  ws.addEventListener('close', () => {
    offlineBanner.hidden = false;
    setTimeout(connect, TUNING.network.reconnectDelayMs);
  });
}

showPlayers([]);
connect();
