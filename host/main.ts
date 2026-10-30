import {
  MAX_PLAYERS,
  WS_PATH,
  type ClientMessage,
  type GameState,
  type PlayerInfo,
  type ServerMessage,
  type Stroke,
} from '../shared/protocol.ts';
import { TUNING } from '../shared/tuning.ts';
import { Game } from './game/Game.ts';

// The big screen. The lobby shows the QR code and the players who joined from their phones,
// with a live readout of each phone's aim and last hit. "Start game" asks the server to start
// a match; the server's game_state then switches between lobby, playing and the scoreboard.

const qrEl = document.getElementById('qr') as HTMLImageElement;
const joinUrlEl = document.getElementById('join-url')!;
const roomCodeEl = document.getElementById('room-code')!;
const playersEl = document.getElementById('players')!;
const offlineBanner = document.getElementById('offline-banner')!;
const lobbyScreen = document.getElementById('lobby-screen')!;
const gameScreen = document.getElementById('game-screen')!;
const startButton = document.getElementById('start') as HTMLButtonElement;

const scoresEl = document.getElementById('hud-scores')!;
const scoreboardEl = document.getElementById('scoreboard')!;
const scoreboardRows = document.getElementById('scoreboard-rows')!;

let game: Game | null = null;
let gameLoading: Promise<Game> | null = null;
let playing = false;
let players: PlayerInfo[] = [];
let lastState: GameState | null = null;

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
      : `Swing · back ${stroke.backswing}° · speed ${stroke.speed}°/s · arc ${stroke.radius ?? '?'} cm · twist ${stroke.twist ?? '?'}°`;
}

function flash(card: HTMLElement): void {
  card.classList.remove('hit');
  void card.offsetWidth; // restart the animation
  card.classList.add('hit');
}

let socket: WebSocket | null = null;

function send(msg: ClientMessage): void {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(msg));
}

function connect(): void {
  const ws = new WebSocket(`wss://${location.host}${WS_PATH}`);
  socket = ws;
  ws.addEventListener('open', () => {
    offlineBanner.hidden = true;
    send({ type: 'host_hello' });
  });
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data) as ServerMessage;
    if (msg.type === 'host_info') showHostInfo(msg);
    else if (msg.type === 'lobby_state') {
      players = msg.players;
      showPlayers(players);
      startButton.disabled = !players.some((p) => p.connected);
      game?.setPlayers(players);
    } else if (msg.type === 'game_state') void onGameState(msg);
    else if (msg.type === 'player_aim') {
      readoutOf(msg.playerId).angle = msg.angle;
      renderReadout(msg.playerId);
      if (playing) game?.onPhoneAim(msg.angle);
    } else if (msg.type === 'player_stroke') {
      const { type: _type, playerId, ...stroke } = msg;
      if (playing) game?.onPhoneStroke(stroke.power, stroke.angle, stroke.twist);
      readoutOf(playerId).stroke = stroke;
      renderReadout(playerId);
      const refs = cards.get(playerId);
      if (refs) flash(refs.card);
    } else if (msg.type === 'player_practice') {
      if (playing) game?.onPhonePractice(msg.power, msg.angle, msg.twist);
    } else if (msg.type === 'player_swing_progress') {
      if (playing) game?.onPhoneSwingProgress(msg);
    }
  });
  ws.addEventListener('close', () => {
    offlineBanner.hidden = false;
    setTimeout(connect, TUNING.network.reconnectDelayMs);
  });
}

// ---------- Lobby <-> game ----------

function loadGame(): Promise<Game> {
  gameLoading ??= Game.create(document.getElementById('game-canvas')!, {
    info: document.getElementById('hud-info')!,
    message: document.getElementById('hud-message')!,
    gauge: document.getElementById('gauge')!,
    gaugeFill: document.getElementById('gauge-fill')!,
    gaugeKnob: document.getElementById('gauge-knob')!,
    gaugeLabel: document.getElementById('gauge-label')!,
  }).then((created) => {
    created.onBallResult = (result) => send({ type: 'ball_result', result });
    created.onLocalStroke = () => send({ type: 'host_stroke' });
    if (import.meta.env.DEV) Object.assign(window, { game: created }); // for debugging in the browser console
    game = created;
    return created;
  });
  return gameLoading;
}

async function onGameState(state: GameState): Promise<void> {
  const previous = lastState;
  lastState = state;
  if (state.phase === 'lobby') {
    game?.syncState(state); // so the next match starts from the tee
    if (playing) {
      playing = false;
      game?.stop();
      gameScreen.hidden = true;
      lobbyScreen.hidden = false;
    }
    return;
  }
  const g = await loadGame();
  if (lastState !== state) return; // a newer state arrived while loading
  g.setPlayers(players);
  if (!playing) {
    playing = true;
    lobbyScreen.hidden = true;
    gameScreen.hidden = false;
    g.start();
  }
  // Tell everyone when a ball was picked up after too many strokes.
  for (const entry of state.players) {
    const before = previous?.players.find((p) => p.id === entry.id);
    if (entry.done === 'picked_up' && before?.done !== 'picked_up') {
      g.announce(`${nameOf(entry.id)} picks up\nScore ${entry.score}`);
    }
  }
  g.syncState(state);
  renderScores(state);
}

function nameOf(id: string): string {
  return players.find((p) => p.id === id)?.name ?? 'Player';
}

function colourOf(id: string): string {
  return players.find((p) => p.id === id)?.colour ?? '#cccccc';
}

/** Compact scores during the hole, and the big scoreboard when everyone has finished. */
function renderScores(state: GameState): void {
  scoresEl.replaceChildren();
  for (const entry of state.players) {
    const row = el('div', 'score-row');
    if (entry.id === state.current) row.classList.add('current');
    if (entry.done) row.classList.add('done');
    const dot = el('span', 'score-dot');
    dot.style.background = colourOf(entry.id);
    const status = entry.done === 'holed' ? '⛳' : entry.done === 'picked_up' ? '✋' : '';
    row.append(dot, el('span', 'score-name', nameOf(entry.id)), el('span', 'score-value', `${entry.strokes} ${status}`));
    scoresEl.append(row);
  }

  scoreboardEl.hidden = state.phase !== 'hole_end';
  if (state.phase !== 'hole_end') return;
  scoreboardRows.replaceChildren();
  const ranked = [...state.players].sort((a, b) => a.score - b.score);
  ranked.forEach((entry, i) => {
    const place = i > 0 && entry.score === ranked[i - 1].score ? '' : `${i + 1}.`;
    const row = el('div', 'board-row');
    const dot = el('span', 'score-dot');
    dot.style.background = colourOf(entry.id);
    row.append(el('span', 'board-place', place), dot, el('span', 'board-name', nameOf(entry.id)), el('span', 'board-score', String(entry.score)));
    scoreboardRows.append(row);
  });
}

startButton.addEventListener('click', () => send({ type: 'start_game' }));
window.addEventListener('keydown', (e) => {
  const phase = lastState?.phase ?? 'lobby';
  if (e.key === 'Enter' && phase !== 'playing') send({ type: 'start_game' });
  else if (e.key === 'Escape' && phase !== 'lobby') send({ type: 'end_game' });
});

showPlayers([]);
connect();
