import { WS_PATH, type ClientMessage, type GameState, type PlayerInfo, type ServerMessage } from '../shared/protocol.ts';
import { TUNING } from '../shared/tuning.ts';
import { Game } from './game/Game.ts';
import { Hub } from './hub/Hub.ts';
import { LobbyUi } from './hub/lobbyUi.ts';
import { Badminton } from './badminton/Badminton.ts';
import { Lab } from './lab/Lab.ts';

// The big screen. The lobby is Cube World: a cube floating in space with one game on each side,
// the QR code to join, and the players' characters standing on top. "Play" asks the server to start
// a match; the server's game_state then switches between lobby, playing and the scoreboard.

const offlineBanner = document.getElementById('offline-banner')!;
const lobbyScreen = document.getElementById('lobby-screen')!;
const gameScreen = document.getElementById('game-screen')!;
const startButton = document.getElementById('start') as HTMLButtonElement;
const lobbyUi = new LobbyUi();

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

// Badminton: the prototype game (Badminton side of the cube → Enter) and the Swing Lab (L).
// Both put the phones into the badminton swing screen (the server's lab mode); Esc goes back to the cube.
const labScreen = document.getElementById('lab-screen')!;
const labEmpty = document.getElementById('lab-empty')!;
const lab = new Lab(document.getElementById('lab-drill') as HTMLCanvasElement, document.getElementById('lab-cards')!);
const badmintonScreen = document.getElementById('badminton-screen')!;
let badminton: Badminton | null = null;
/** Which badminton screen to show when the server confirms (or null while on the cube). */
let badmintonWanted: 'game' | 'lab' = 'lab';
let labOpen = false;
/** The phones that play badminton: the first connected player (near side) and the second (far side, else the computer). */
let badmintonIds: [string | null, string | null] = [null, null];

function badmintonPlayers(): [PlayerInfo | null, PlayerInfo | null] {
  const find = (id: string | null): PlayerInfo | null => players.find((p) => p.id === id) ?? null;
  return [find(badmintonIds[0]), find(badmintonIds[1])];
}

function openBadminton(view: 'game' | 'lab'): void {
  badmintonWanted = view;
  send({ type: 'lab_mode', on: true });
}

function showLab(on: boolean): void {
  if (on === labOpen) return;
  labOpen = on;
  const game = on && badmintonWanted === 'game';
  labScreen.hidden = !on || game;
  badmintonScreen.hidden = !game;
  lobbyScreen.hidden = on;
  if (on) {
    hub?.stop();
    if (game) {
      const connected = players.filter((p) => p.connected);
      badmintonIds = [connected[0]?.id ?? null, connected[1]?.id ?? null];
      badminton ??= new Badminton(document.getElementById('badminton-canvas')!, {
        screen: badmintonScreen,
        score: document.getElementById('badminton-score')!,
        message: document.getElementById('badminton-message')!,
        feedbackNear: document.getElementById('badminton-feedback-near')!,
        feedbackFar: document.getElementById('badminton-feedback-far')!,
      });
      if (import.meta.env.DEV) Object.assign(window, { badminton }); // for debugging in the browser console
      badminton.start(...badmintonPlayers());
    } else lab.start();
  } else {
    lab.stop();
    badminton?.stop();
    badmintonWanted = 'lab';
    hub?.start();
  }
}

function showHostInfo(msg: Extract<ServerMessage, { type: 'host_info' }>): void {
  lobbyUi.setRoom(msg.room, msg.qrDataUrl, msg.joinUrl);
  document.getElementById('lab-room')!.textContent = msg.room;
}

function el(tag: string, className: string, text = ''): HTMLElement {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = text;
  return element;
}

function startSelected(): void {
  if (!lobbyUi.playState(hub?.selected).enabled) return;
  lobbyUi.pressPlay();
  if (hub?.selected?.id === 'badminton') {
    openBadminton('game');
    return;
  }
  send({ type: 'start_game' });
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
    lobbyUi.setOnline(true);
    send({ type: 'host_hello' });
  });
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data) as ServerMessage;
    if (msg.type === 'host_info') showHostInfo(msg);
    else if (msg.type === 'lobby_state') {
      players = msg.players;
      hub?.setPlayers(players);
      lobbyUi.setPlayers(players);
      game?.setPlayers(players);
      lab.setPlayers(players);
      if (!badmintonScreen.hidden) badminton?.setPlayers(...badmintonPlayers());
      labEmpty.hidden = players.length > 0;
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
    } else if (msg.type === 'lab_state') showLab(msg.on);
    else if (msg.type === 'player_badminton_swing') {
      if (!badmintonScreen.hidden) {
        const side = msg.playerId === badmintonIds[0] ? 1 : msg.playerId === badmintonIds[1] ? -1 : null;
        if (side !== null && !msg.ignored) badminton?.onSwing(side, msg.at, msg.power, msg.aim);
      } else lab.onSwing(msg);
    }
  });
  ws.addEventListener('close', () => {
    offlineBanner.hidden = false;
    lobbyUi.setOnline(false);
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
      hub?.select('minigolf');
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
document.getElementById('turn-left')!.addEventListener('click', () => hub?.cycle(-1));
document.getElementById('turn-right')!.addEventListener('click', () => hub?.cycle(1));
lobbyUi.onChoose = (id) => hub?.select(id);
window.addEventListener('keydown', (e) => {
  // A focused button handles Enter and Space itself (keyboard users can Tab to it).
  if (e.target instanceof HTMLButtonElement && (e.key === 'Enter' || e.key === ' ')) return;
  const phase = lastState?.phase ?? 'lobby';
  if (labOpen) {
    const inLab = badmintonScreen.hidden;
    if (e.key === 'Escape' || (inLab && (e.key === 'l' || e.key === 'L'))) send({ type: 'lab_mode', on: false });
    return;
  }
  if (phase === 'lobby' && !playing) {
    if (e.key === 'l' || e.key === 'L') {
      openBadminton('lab');
      return;
    }
    if (e.key === 'ArrowLeft') hub?.cycle(-1);
    else if (e.key === 'ArrowRight') hub?.cycle(1);
    else if (e.key === 'Escape') hub?.select(null);
    else if (e.key === 'Enter') {
      if (hub?.selected) startSelected();
      else hub?.select('minigolf');
    }
    return;
  }
  if (e.key === 'Enter' && phase === 'hole_end') send({ type: 'next_hole' });
  else if (e.key === 'Enter' && phase === 'game_end') send({ type: 'start_game' });
  else if (e.key === 'Escape' && phase !== 'lobby') send({ type: 'end_game' });
});

void Hub.create(document.getElementById('hub-canvas')!).then((created) => {
  hub = created;
  hub.onSelect = (face) => lobbyUi.showGame(face);
  hub.setPlayers(players);
  lobbyUi.showGame(hub.selected);
  if (!playing && !labOpen) hub.start();
  if (import.meta.env.DEV) Object.assign(window, { hub }); // for debugging in the browser console
});
connect();
