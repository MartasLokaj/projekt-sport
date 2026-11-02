import { WS_PATH, type ClientMessage, type GameState, type PlayerInfo, type ServerMessage } from '../shared/protocol.ts';
import { TUNING } from '../shared/tuning.ts';
import { Game } from './game/Game.ts';
import { Hub } from './hub/Hub.ts';
import { LobbyUi } from './hub/lobbyUi.ts';
import { Badminton } from './badminton/Badminton.ts';
import { Curling } from './curling/Curling.ts';
import { Lab } from './lab/Lab.ts';
import { Flash } from './ui/transition.ts';
import { sound, type MusicName } from './audio/sound.ts';
import { Podium, type PodiumShow } from './results/Podium.ts';
import { lookOf } from './game/character.ts';

// The big screen. The lobby is Cube World: a cube floating in space with one game on each side,
// the QR code to join, and the players' characters standing on top. "Play" asks the server to start
// a match; the server's game_state then switches between lobby, playing and the scoreboard.

const offlineBanner = document.getElementById('offline-banner')!;
const lobbyScreen = document.getElementById('lobby-screen')!;
const gameScreen = document.getElementById('game-screen')!;
const startButton = document.getElementById('start') as HTMLButtonElement;
const lobbyUi = new LobbyUi();

// The title menu: the spinning cube behind frosted glass, with Play and How to Play.
const titleScreen = document.getElementById('title-screen')!;
const titleMenu = document.getElementById('title-menu')!;
const howTo = document.getElementById('how-to')!;
let onTitle = true;

function showTitle(on: boolean): void {
  onTitle = on;
  titleScreen.classList.toggle('away', !on);
  lobbyScreen.classList.toggle('on-title', on);
  if (hub) hub.showcase = on;
  if (on) {
    hub?.select(null);
    showHowTo(false);
  } else {
    (document.activeElement as HTMLElement | null)?.blur();
  }
}

function showHowTo(on: boolean): void {
  howTo.hidden = !on;
  titleMenu.hidden = on;
  document.getElementById(on ? 'how-close' : 'title-play')!.focus();
}

document.getElementById('title-play')!.addEventListener('click', () => showTitle(false));
document.getElementById('title-how')!.addEventListener('click', () => showHowTo(true));
document.getElementById('how-close')!.addEventListener('click', () => showHowTo(false));
for (const id of ['title-play', 'title-how', 'how-close']) {
  document.getElementById(id)!.addEventListener('click', () => sound.play('ui-click'));
}

// M mutes all sound (remembered on this computer); a small badge shows it.
const muteBadge = document.createElement('div');
muteBadge.id = 'mute-badge';
muteBadge.textContent = '🔇 Sound off · M';
document.body.append(muteBadge);
muteBadge.hidden = !sound.muted;
sound.playMusic('lobby');
lobbyScreen.classList.add('on-title');

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

// Cube <-> game: the camera dives into the game's side, a soft flash hides the switch, and the game's camera
// glides down; after the match the flash comes back and the cube's camera pulls out of the side.
// The steps run one after another (a quick Esc during the dive waits for it), and keys wait meanwhile.
const flash = new Flash();
let transitions = Promise.resolve();
let transitioning = 0;

function transition(steps: () => Promise<void>): void {
  transitioning++;
  transitions = transitions
    .then(steps)
    .catch((error: unknown) => console.error(error))
    .finally(() => transitioning--);
}

/** Flies into the side of `id`, then `show` swaps the screens behind the flash. */
function enterGame(id: string, show: () => void | Promise<void>): void {
  transition(async () => {
    hub?.select(id);
    sound.play('ui-play');
    sound.playMusic(id === 'curling' ? 'lobby' : (id as MusicName)); // (no curling music yet)
    lobbyScreen.classList.add('diving');
    const dive = hub?.diveIn();
    // The flash starts while the camera is still flying, so the dive ends in white without stopping.
    const t = TUNING.transition;
    await new Promise((done) => setTimeout(done, Math.max(0, t.diveSeconds * 1000 - t.flashInMs)));
    await flash.cover();
    await dive;
    hub?.stop();
    lobbyScreen.classList.remove('diving');
    await show();
    flash.reveal();
  });
}

/** Behind the flash `hide` closes the game, then the cube's camera pulls back out of the side of `id`. */
function leaveGame(id: string, hide: () => void): void {
  transition(async () => {
    await flash.cover();
    hide();
    podium.hide();
    podiumGame = null;
    sound.playMusic('lobby');
    lobbyScreen.hidden = false;
    hub?.start();
    showTitle(false);
    hub?.pullOut(id);
    flash.reveal();
  });
}

// The podium after a match (both games): Enter plays again, Esc goes back to the cube.
const podium = new Podium();
if (import.meta.env.DEV) Object.assign(window, { podium }); // for debugging in the browser console
let podiumGame: 'minigolf' | 'badminton' | null = null;

/** Behind the flash: `stop` pauses the game underneath, then the podium shows. */
function showPodium(show: PodiumShow, stop: () => void): void {
  transition(async () => {
    await flash.cover();
    stop();
    podiumGame = show.game;
    podium.show(show);
    flash.reveal();
  });
}

/** Behind the flash: the podium goes and `start` starts the next match, whose camera glides in. */
function leavePodium(start: () => void): void {
  transition(async () => {
    await flash.cover();
    podium.hide();
    podiumGame = null;
    start();
    flash.reveal();
  });
}

podium.onPlayAgain = () => {
  if (transitioning) return;
  if (podiumGame === 'minigolf') send({ type: 'start_game', firstHole: firstHoleForTesting(), course: lobbyUi.course });
  else if (podiumGame === 'badminton') {
    leavePodium(() => {
      badminton?.start(badmintonPlayers(), lobbyUi.cpuLevel, lobbyUi.matchLength, badmintonDoubles);
      badminton?.swoopIn();
    });
  }
};
podium.onBack = () => {
  if (transitioning) return;
  if (podiumGame === 'minigolf') send({ type: 'end_game' });
  else if (podiumGame === 'badminton') send({ type: 'lab_mode', on: false });
};

/** Minigolf's podium: ranked by total strokes (fewest wins; equal totals share a place). */
function minigolfPodium(state: GameState): PodiumShow {
  const ranked = [...state.players].sort((a, b) => a.total - b.total);
  const entries = ranked.map((entry) => {
    const player = players.find((p) => p.id === entry.id);
    return {
      name: nameOf(entry.id),
      look: player ? lookOf(player) : { shirt: colourOf(entry.id), skin: '#f3c79a', handedness: 'right' as const },
      place: 1 + ranked.filter((other) => other.total < entry.total).length,
      detail: `${entry.total} stroke${entry.total === 1 ? '' : 's'}`,
    };
  });
  const winners = entries.filter((e) => e.place === 1);
  return {
    game: 'minigolf',
    title: winners.length === 1 ? `${winners[0].name} wins!` : "It's a tie!",
    subtitle: `Minigolf · ${state.holeCount} holes`,
    entries,
  };
}

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
/**
 * The phones that play badminton, by seat: 1st connected player near side, 2nd far side (else the computer);
 * with 3 or 4 phones it is 2 v 2: the 3rd joins the near side, the 4th the far side (else the computer).
 */
let badmintonIds: (string | null)[] = [null, null];
/** Whether the current badminton match is 2 v 2 (for Play again on the podium). */
let badmintonDoubles = false;

function badmintonPlayers(): (PlayerInfo | null)[] {
  return badmintonIds.map((id) => players.find((p) => p.id === id) ?? null);
}

function openBadminton(view: 'game' | 'lab'): void {
  badmintonWanted = view;
  send({ type: 'lab_mode', on: true });
}

function showLab(on: boolean): void {
  if (on === labOpen) return;
  labOpen = on;
  const game = on && badmintonWanted === 'game';
  if (on && !game) {
    // The Swing Lab opens straight away, without the dive.
    labScreen.hidden = false;
    lobbyScreen.hidden = true;
    hub?.stop();
    lab.start();
  } else if (game) {
    enterGame('badminton', () => {
      lobbyScreen.hidden = true;
      badmintonScreen.hidden = false;
      const connected = players.filter((p) => p.connected);
      const doubles = connected.length >= 3;
      badmintonDoubles = doubles;
      badmintonIds = [0, 1, 2, 3].slice(0, doubles ? 4 : 2).map((seat) => connected[seat]?.id ?? null);
      badminton ??= new Badminton(document.getElementById('badminton-canvas')!, {
        screen: badmintonScreen,
        score: document.getElementById('badminton-score')!,
        message: document.getElementById('badminton-message')!,
        feedbackNear: document.getElementById('badminton-feedback-near')!,
        feedbackFar: document.getElementById('badminton-feedback-far')!,
        flash: document.getElementById('badminton-flash')!,
        popNear: document.getElementById('badminton-pop-near')!,
        popFar: document.getElementById('badminton-pop-far')!,
        level: document.getElementById('badminton-level')!,
        rallyNear: document.getElementById('badminton-rally-near')!,
        rallyFar: document.getElementById('badminton-rally-far')!,
      });
      badminton.onCue = (seat, cue) => {
        const playerId = badmintonIds[seat];
        if (playerId) send({ type: 'badminton_cue', playerId, cue });
      };
      badminton.onOutcome = (outcome) => send({ type: 'badminton_outcome', outcome });
      // After the last point the reactions play a moment, then the podium comes (unless a new match began).
      badminton.onMatchOver = () => {
        window.setTimeout(() => {
          if (badminton?.matchOver && !badmintonScreen.hidden && !podium.visible) showPodium(badminton.podium(), () => badminton?.stop());
        }, TUNING.podium.badmintonDelayMs);
      };
      if (import.meta.env.DEV) Object.assign(window, { badminton }); // for debugging in the browser console
      badminton.start(badmintonPlayers(), lobbyUi.cpuLevel, lobbyUi.matchLength, doubles);
      badminton.swoopIn();
    });
  } else if (!badmintonScreen.hidden || badmintonWanted === 'game') {
    // Back from a badminton match: through the flash, out of the Badminton side.
    badmintonWanted = 'lab';
    leaveGame('badminton', () => {
      badminton?.stop();
      badmintonScreen.hidden = true;
    });
  } else {
    lab.stop();
    labScreen.hidden = true;
    lobbyScreen.hidden = false;
    hub?.start();
  }
}

// Curling (phase C1): the Curling side of the cube → Enter. Phones show the swing screen (the server's curling
// mode) and any phone throws the next stone; Esc goes back to the cube.
const curlingScreen = document.getElementById('curling-screen')!;
let curling: Curling | null = null;
let curlingOpen = false;

function showCurling(on: boolean): void {
  if (on === curlingOpen) return;
  curlingOpen = on;
  if (on) {
    enterGame('curling', () => {
      lobbyScreen.hidden = true;
      curlingScreen.hidden = false;
      curling ??= new Curling(document.getElementById('curling-canvas')!, {
        info: document.getElementById('curling-info')!,
        power: document.getElementById('curling-power')!,
        powerFill: document.getElementById('curling-power-fill')!,
      });
      if (import.meta.env.DEV) Object.assign(window, { curling }); // for debugging in the browser console
      curling.start();
      curling.swoopIn();
    });
  } else {
    leaveGame('curling', () => {
      curling?.stop();
      curlingScreen.hidden = true;
    });
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
  if (hub?.selected?.id === 'curling') {
    send({ type: 'curling_mode', on: true });
    return;
  }
  send({ type: 'start_game', firstHole: firstHoleForTesting(), course: lobbyUi.course });
}

/** Testing shortcut: open the page with ?hole=4 to start the game at hole 4. */
function firstHoleForTesting(): number {
  const hole = Number(new URLSearchParams(location.search).get('hole'));
  return Number.isFinite(hole) && hole >= 1 ? hole - 1 : 0;
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
      if (!badmintonScreen.hidden) badminton?.setPlayers(badmintonPlayers());
      labEmpty.hidden = players.length > 0;
    } else if (msg.type === 'game_state') void onGameState(msg);
    else if (msg.type === 'player_look_saved') hub?.waveHello(msg.playerId);
    else if (msg.type === 'player_aim') {
      if (playing) game?.onPhoneAim(msg.angle);
      else if (curlingOpen) curling?.onPhoneAim(msg.angle);
    } else if (msg.type === 'player_stroke') {
      if (playing) game?.onPhoneStroke(msg.power, msg.angle, msg.twist);
      else if (curlingOpen) curling?.onPhoneStroke(msg.power, msg.angle, msg.twist);
      else hub?.showHit(msg.playerId, msg.power);
    } else if (msg.type === 'player_practice') {
      if (playing) game?.onPhonePractice(msg.power, msg.angle, msg.twist);
    } else if (msg.type === 'player_swing_progress') {
      if (playing) game?.onPhoneSwingProgress(msg);
    } else if (msg.type === 'lab_state') showLab(msg.on);
    else if (msg.type === 'curling_state') showCurling(msg.on);
    else if (msg.type === 'player_badminton_swing') {
      if (!badmintonScreen.hidden) {
        const seat = badmintonIds.indexOf(msg.playerId);
        if (seat >= 0 && !msg.ignored) badminton?.onSwing(seat, msg.at, msg.power, msg.aim, msg.short, msg.receivedAt);
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
      // Back to the cube, out of the side of the game we just played.
      leaveGame('minigolf', () => {
        game?.stop();
        gameScreen.hidden = true;
      });
    }
    return;
  }
  // Starting: the dive into the Minigolf side begins while the course loads.
  if (!playing) {
    playing = true;
    enterGame('minigolf', async () => {
      const g = await loadGame(); // the flash stays up if the course is still loading
      lobbyScreen.hidden = true;
      gameScreen.hidden = false;
      g.start();
      g.swoopIn();
    });
  }
  const g = await loadGame();
  if (lastState !== state) return; // a newer state arrived while loading
  g.setPlayers(players);
  // Tell everyone when a ball was picked up after too many strokes.
  for (const entry of state.players) {
    const before = previous?.players.find((p) => p.id === entry.id);
    if (entry.done === 'picked_up' && before?.done !== 'picked_up') {
      g.announce(`${nameOf(entry.id)} picks up\nScore ${entry.score}`);
    }
  }
  g.syncState(state);
  renderScores(state);
  // The last hole is done: the podium. A new game from the podium: back to the course, the camera gliding in.
  if (state.phase === 'game_end' && previous?.phase !== 'game_end') showPodium(minigolfPodium(state), () => g.stop());
  else if (state.phase === 'playing' && podiumGame === 'minigolf') {
    leavePodium(() => {
      g.start();
      g.swoopIn();
    });
  }
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
  scoreboardEl.hidden = !finished || state.phase === 'game_end'; // the end of a game shows the podium instead
  if (!finished) return;
  const last = state.phase === 'game_end';
  scoreboardTitle.textContent = last ? 'Final results' : `Hole ${state.hole + 1} complete!`;
  scoreboardHint.textContent = last ? 'Enter: play again · Esc: back to the lobby' : 'Enter: next hole · Esc: back to the lobby';

  // A table: one column per hole, then the total. Ranked by total (lowest wins).
  scoreboardRows.replaceChildren();
  const header = el('div', 'board-row board-header');
  header.append(el('span', 'board-place'), el('span', 'score-dot hidden-dot'), el('span', 'board-name', ''));
  // The real hole numbers (a 3-hole game plays 3 of the 9).
  for (let h = 0; h < state.holeCount; h++) header.append(el('span', 'board-hole', `${(state.course[h] ?? h) + 1}`));
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
lobbyUi.onKick = (playerId) => send({ type: 'kick_player', playerId });
lobbyUi.onNewRoom = () => send({ type: 'reset_room' });
window.addEventListener('keydown', (e) => {
  // A focused button handles Enter and Space itself (keyboard users can Tab to it).
  if (e.target instanceof HTMLButtonElement && (e.key === 'Enter' || e.key === ' ')) return;
  if (transitioning) return; // keys wait while the camera dives in or pulls out
  if (e.key === 'm' || e.key === 'M') {
    muteBadge.hidden = !sound.toggleMute();
    return;
  }
  if (lobbyUi.kickOpen) {
    lobbyUi.handleKickKey(e);
    return;
  }
  const phase = lastState?.phase ?? 'lobby';
  if (curlingOpen) {
    // The other keys (aim, throw, curl) belong to the curling game itself.
    if (e.key === 'Escape') send({ type: 'curling_mode', on: false });
    return;
  }
  if (onTitle && !playing && !labOpen) {
    if (!howTo.hidden) {
      if (e.key === 'Escape' || e.key === 'Enter') showHowTo(false);
    } else if (e.key === 'Enter') {
      sound.play('ui-click');
      showTitle(false);
    }
    return;
  }
  if (labOpen) {
    const inLab = badmintonScreen.hidden;
    if (e.key === 'Escape' || (inLab && (e.key === 'l' || e.key === 'L'))) send({ type: 'lab_mode', on: false });
    return;
  }
  if (phase === 'lobby' && !playing) {
    if (lobbyUi.handleLevelKey(e)) return;
    if (e.key === 'l' || e.key === 'L') {
      openBadminton('lab');
      return;
    }
    if (e.key === 'ArrowLeft') hub?.cycle(-1);
    else if (e.key === 'ArrowRight') hub?.cycle(1);
    else if (e.key === 'Escape') {
      // Esc lets go of the chosen game; with nothing chosen it goes back to the title menu.
      if (hub?.selected) hub.select(null);
      else {
        sound.play('ui-back');
        showTitle(true);
      }
    } else if (e.key === 'Enter') {
      if (hub?.selected) startSelected();
      else hub?.select('minigolf');
    }
    return;
  }
  if (e.key === 'Enter' && phase === 'hole_end') send({ type: 'next_hole' });
  else if (e.key === 'Enter' && phase === 'game_end') send({ type: 'start_game', firstHole: firstHoleForTesting(), course: lobbyUi.course });
  else if (e.key === 'Escape' && phase !== 'lobby') send({ type: 'end_game' });
});

void Hub.create(document.getElementById('hub-canvas')!).then((created) => {
  hub = created;
  hub.onSelect = (face) => {
    lobbyUi.showGame(face);
    if (!transitioning) sound.play(face ? 'ui-select' : 'ui-back');
  };
  hub.showcase = onTitle;
  hub.setPlayers(players);
  lobbyUi.showGame(hub.selected);
  if (!playing && !labOpen) hub.start();
  if (import.meta.env.DEV) Object.assign(window, { hub }); // for debugging in the browser console
});
connect();
