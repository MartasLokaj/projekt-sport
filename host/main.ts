import { WS_PATH, type ClientMessage, type GameState, type PlayerInfo, type ServerMessage } from '../shared/protocol.ts';
import { TUNING } from '../shared/tuning.ts';
import { Game } from './game/Game.ts';
import { Hub } from './hub/Hub.ts';
import type { FaceInfo } from './hub/faces.ts';

// The big screen. The lobby is Cube World: a cube floating in space with one game on each side,
// the QR code to join, and the players' characters standing on top. "Play" asks the server to start
// a match; the server's game_state then switches between lobby, playing and the scoreboard.

const qrEl = document.getElementById('qr') as HTMLImageElement;
const joinUrlEl = document.getElementById('join-url')!;
const roomCodeEl = document.getElementById('room-code')!;
const offlineBanner = document.getElementById('offline-banner')!;
const lobbyScreen = document.getElementById('lobby-screen')!;
const gameScreen = document.getElementById('game-screen')!;
const startButton = document.getElementById('start') as HTMLButtonElement;
const pickTitle = document.getElementById('pick-title')!;
const pickDescription = document.getElementById('pick-description')!;
const pickPlayers = document.getElementById('pick-players')!;

const scoresEl = document.getElementById('hud-scores')!;
const scoreboardEl = document.getElementById('scoreboard')!;
const scoreboardRows = document.getElementById('scoreboard-rows')!;
const scoreboardTitle = document.getElementById('scoreboard-title')!;
const scoreboardHint = document.getElementById('scoreboard-hint')!;

let game: Game | null = null;
let gameLoading: Promise<Game> | null = null;
let playing = false;
let players: PlayerInfo[] = [];
let lastState: GameState | null = null;

let hub: Hub | null = null;

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

/** The game on the front of the cube, and whether it can be played yet. */
function showPick(face: FaceInfo): void {
  pickTitle.textContent = face.title;
  pickDescription.textContent = face.description;
  const ready = players.filter((p) => p.connected).length;
  pickPlayers.textContent = face.available
    ? `${face.players} · ${ready === 0 ? 'waiting for players to join' : `${ready} ready`}`
    : face.players;
  startButton.textContent = face.available ? 'Play (Enter)' : 'Coming soon';
  startButton.disabled = !face.available || ready === 0;
}

function startSelected(): void {
  if (hub?.selected.available && players.some((p) => p.connected)) send({ type: 'start_game' });
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
      hub?.setPlayers(players);
      if (hub) showPick(hub.selected);
      game?.setPlayers(players);
    } else if (msg.type === 'game_state') void onGameState(msg);
    else if (msg.type === 'player_aim') {
      if (playing) game?.onPhoneAim(msg.angle);
    } else if (msg.type === 'player_stroke') {
      if (playing) game?.onPhoneStroke(msg.power, msg.angle, msg.twist);
      else hub?.showHit(msg.playerId, msg.power);
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
      // Back to the cube, with the game we just played in front.
      hub?.start();
      hub?.show('minigolf');
    }
    return;
  }
  const g = await loadGame();
  if (lastState !== state) return; // a newer state arrived while loading
  g.setPlayers(players);
  if (!playing) {
    playing = true;
    hub?.stop();
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
    row.append(
      dot,
      el('span', 'score-name', nameOf(entry.id)),
      el('span', 'score-value', `${entry.strokes} ${status}`),
      el('span', 'score-total', `Σ ${entry.total}`),
    );
    scoresEl.append(row);
  }

  const finished = state.phase === 'hole_end' || state.phase === 'game_end';
  scoreboardEl.hidden = !finished;
  if (!finished) return;
  const last = state.phase === 'game_end';
  scoreboardTitle.textContent = last ? 'Final results' : `Hole ${state.hole + 1} complete!`;
  scoreboardHint.textContent = last ? 'Enter: play again · Esc: back to the lobby' : 'Enter: next hole · Esc: back to the lobby';

  // A table: one column per hole, then the total. Ranked by total (lowest wins).
  scoreboardRows.replaceChildren();
  const header = el('div', 'board-row board-header');
  header.append(el('span', 'board-place'), el('span', 'score-dot hidden-dot'), el('span', 'board-name', ''));
  for (let h = 0; h < state.holeCount; h++) header.append(el('span', 'board-hole', `${h + 1}`));
  header.append(el('span', 'board-score', 'Total'));
  scoreboardRows.append(header);
  const ranked = [...state.players].sort((a, b) => a.total - b.total);
  ranked.forEach((entry, i) => {
    const place = i > 0 && entry.total === ranked[i - 1].total ? '' : `${i + 1}.`;
    const row = el('div', 'board-row');
    const dot = el('span', 'score-dot');
    dot.style.background = colourOf(entry.id);
    row.append(el('span', 'board-place', place), dot, el('span', 'board-name', nameOf(entry.id)));
    for (let h = 0; h < state.holeCount; h++) row.append(el('span', 'board-hole', entry.holeScores[h]?.toString() ?? '–'));
    row.append(el('span', 'board-score', String(entry.total)));
    scoreboardRows.append(row);
  });
}

startButton.addEventListener('click', startSelected);
document.getElementById('turn-left')!.addEventListener('click', () => hub?.turn(-1));
document.getElementById('turn-right')!.addEventListener('click', () => hub?.turn(1));
window.addEventListener('keydown', (e) => {
  const phase = lastState?.phase ?? 'lobby';
  if (phase === 'lobby' && !playing) {
    if (e.key === 'ArrowLeft') hub?.turn(-1);
    else if (e.key === 'ArrowRight') hub?.turn(1);
    else if (e.key === 'Enter') startSelected();
    return;
  }
  if (e.key === 'Enter' && phase === 'hole_end') send({ type: 'next_hole' });
  else if (e.key === 'Enter' && phase === 'game_end') send({ type: 'start_game' });
  else if (e.key === 'Escape' && phase !== 'lobby') send({ type: 'end_game' });
});

void Hub.create(document.getElementById('hub-canvas')!).then((created) => {
  hub = created;
  hub.onSelect = showPick;
  hub.setPlayers(players);
  showPick(hub.selected);
  if (!playing) hub.start();
  if (import.meta.env.DEV) Object.assign(window, { hub }); // for debugging in the browser console
});
connect();
