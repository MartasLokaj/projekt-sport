import {
  NAME_MAX_LENGTH,
  ROOM_CODE_LENGTH,
  SENSITIVITY_DEFAULT,
  SENSITIVITY_MAX,
  SENSITIVITY_MIN,
  SHIRT_COLOURS,
  SKIN_TONES,
  WS_PATH,
  type ClientMessage,
  type GameState,
  type Handedness,
  type JoinError,
  type PlayerInfo,
  type ServerMessage,
} from '../shared/protocol.ts';
import { DEFAULT_LOOK, sanitizeLook, type AvatarLook } from '../shared/avatar.ts';
import { TUNING } from '../shared/tuning.ts';
import { initEditor, type EditorState } from './avatar/editor.ts';
import { createAvatarPreview } from './avatar/preview.ts';
import { initLabScreen } from './badminton/lab.ts';
import { initPlayScreen } from './play.ts';
import { initSkiScreen } from './ski/screen.ts';

// The phone controller: join the game (room code from the QR code link, or typed in),
// stay joined through screen locks and Wi-Fi blips, then aim and hit on the play screen.

type Profile = {
  playerId: string;
  name: string;
  colour: string;
  skinTone: string;
  handedness: Handedness;
  sensitivity: number;
  /** Face, hair, hat, glasses, gear colours (shared/avatar.ts). */
  look: AvatarLook;
};

const PROFILE_KEY = 'minigolf.profile';

let room = new URLSearchParams(location.search).get('room')?.toUpperCase() ?? null;
const profile = loadProfile();

const screens = {
  message: document.getElementById('screen-message')!,
  room: document.getElementById('screen-room')!,
  join: document.getElementById('screen-join')!,
  play: document.getElementById('screen-play')!,
  lab: document.getElementById('screen-lab')!,
  ski: document.getElementById('screen-ski')!,
  editor: document.getElementById('screen-editor')!,
};
const messageTitle = document.getElementById('message-title')!;
const messageText = document.getElementById('message-text')!;
const messageButton = document.getElementById('message-button')!;
const roomForm = document.getElementById('room-form') as HTMLFormElement;
const roomInput = document.getElementById('room-code') as HTMLInputElement;
const roomError = document.getElementById('room-error')!;
const joinForm = document.getElementById('join-form') as HTMLFormElement;
const nameInput = document.getElementById('name') as HTMLInputElement;
const sensitivityInput = document.getElementById('sensitivity') as HTMLInputElement;
const sensitivityValue = document.getElementById('sensitivity-value')!;
const joinAvatar = document.getElementById('join-avatar')!;
const joinError = document.getElementById('join-error')!;
const meDot = document.getElementById('me-dot')!;
const meName = document.getElementById('me-name')!;
const wakeTip = document.getElementById('wake-tip')!;
const reconnecting = document.getElementById('reconnecting')!;

let ws: WebSocket | null = null;
let reconnectTimer: number | undefined;
/** Set when reconnecting would not help (game opened in another tab). */
let stopped = false;
let joined = false;
/** After the next 'joined', open the character editor instead of the play screen (Customize on the join screen). */
let editorAfterJoin = false;
let otherPlayers: PlayerInfo[] = [];
let allPlayers: PlayerInfo[] = [];
let gameState: GameState | null = null;
let lastTurn = -1;
/** The big screen has the Badminton Swing Lab open. */
let labOpen = false;
/** Whether Curling is open on the big screen (the controls then stay open in the lobby). */
let curlingOpen = false;
/** Whether Skiing is open on the big screen (the phone is then a steering wheel). */
let skiOpen = false;

// ---------- Screens ----------

function show(screen: keyof typeof screens): void {
  for (const [name, el] of Object.entries(screens)) el.hidden = name !== screen;
}

function showMessage(title: string, text = '', button = false): void {
  messageTitle.textContent = title;
  messageText.textContent = text;
  messageButton.hidden = !button;
  show('message');
}

function showRoomForm(error = ''): void {
  joined = false;
  lab.setOpen(false);
  ski.setOpen(false);
  roomError.textContent = error;
  show('room');
}

function showJoinForm(error = ''): void {
  joined = false;
  editorAfterJoin = false;
  lab.setOpen(false);
  ski.setOpen(false);
  if (!nameInput.value) nameInput.value = profile.name;
  sensitivityInput.value = String(profile.sensitivity);
  renderSettings();
  joinError.textContent = error;
  freeColour();
  preview.setLook(characterLook());
  preview.mount(joinAvatar);
  show('join');
}

function showJoined(): void {
  joined = true;
  meDot.style.background = profile.colour;
  meName.textContent = profile.name;
  wakeTip.hidden = 'wakeLock' in navigator;
  show(labOpen ? 'lab' : skiOpen ? 'ski' : 'play');
  lab.setOpen(labOpen);
  ski.setOpen(skiOpen);
  play.onJoined();
  renderTurn();
}

/** While joined, the lab replaces the play screen. */
function renderLab(): void {
  lab.setOpen(joined && labOpen);
  if (!joined) return;
  if (labOpen) {
    play.cancel();
    show('lab');
  } else if (!screens.lab.hidden) show('play'); // (the character editor stays open if it is)
}

/** While joined, the steering wheel replaces the play screen while Skiing is open. */
function renderSki(): void {
  ski.setOpen(joined && skiOpen);
  if (!joined) return;
  if (skiOpen) {
    play.cancel();
    show('ski');
  } else if (!screens.ski.hidden) show('play'); // (the character editor stays open if it is)
}

// ---------- Whose turn ----------
// The controls are covered by a message unless it is this phone's turn.

const turnOverlay = document.getElementById('turn-overlay')!;
const turnTitle = document.getElementById('turn-title')!;
const turnText = document.getElementById('turn-text')!;
const turnButton = document.getElementById('turn-button') as HTMLButtonElement;
const turnEdit = document.getElementById('turn-edit')!;

function nameOf(id: string | null): string {
  return allPlayers.find((p) => p.id === id)?.name ?? 'Someone';
}

function renderTurn(): void {
  if (!joined || !gameState) return;
  const me = profile.playerId;
  const state = gameState;
  const mine = state.players.find((p) => p.id === me);
  const leader = state.leaderId === me;
  let title = '';
  let text = '';
  let button: string | null = null;

  if (state.phase === 'lobby' && curlingOpen) {
    // Curling: any phone throws the next stone, so the controls stay open.
    if (!turnOverlay.hidden) {
      play.resetAim();
      play.showStatus('Curling! Aim, then swing to throw the stone.');
    }
    turnOverlay.hidden = true;
    return;
  } else if (state.phase === 'lobby') {
    title = "You're in!";
    text = leader ? 'Start the game when everyone has joined.' : `Waiting for ${nameOf(state.leaderId)} or the big screen to start the game…`;
    button = leader ? 'Start game' : null;
  } else if (state.phase === 'playing') {
    if (!mine) {
      title = 'Game in progress';
      text = 'You can play in the next game.';
    } else if (state.current === me) {
      if (state.turn !== lastTurn) {
        lastTurn = state.turn;
        play.resetAim();
        play.showStatus(mine.strokes === 0 ? 'Your turn! Aim, then swing.' : `Your turn! Stroke ${mine.strokes + 1}.`);
        if ('vibrate' in navigator) navigator.vibrate([60, 60, 60]);
      }
      turnOverlay.hidden = true;
      return;
    } else if (mine.done) {
      title = mine.done === 'holed' ? 'In the hole! ⛳' : 'Ball picked up';
      text = `Your score: ${mine.score}. Watch the others finish.`;
    } else {
      title = `${nameOf(state.current)}'s turn`;
      text = `You: ${mine.strokes} stroke${mine.strokes === 1 ? '' : 's'} so far.`;
    }
  } else if (state.phase === 'hole_end') {
    title = `Hole ${state.hole + 1} complete!`;
    text = mine ? `This hole: ${mine.score}. Total: ${mine.total}.` : 'Look at the big screen.';
    button = leader ? 'Next hole' : null;
  } else {
    const ranked = [...state.players].sort((a, b) => a.total - b.total);
    const place = mine ? ranked.findIndex((p) => p.total === mine.total) + 1 : 0;
    title = place === 1 ? 'You win! 🏆' : 'Game over!';
    text = mine ? `Total: ${mine.total} · Place ${place} of ${ranked.length}` : 'Look at the big screen.';
    button = leader ? 'Play again' : null;
  }
  play.cancel();
  turnTitle.textContent = title;
  turnText.textContent = text;
  turnButton.hidden = button === null;
  turnButton.textContent = button ?? '';
  turnEdit.hidden = state.phase !== 'lobby';
  turnOverlay.hidden = false;
}

turnButton.addEventListener('click', () => send({ type: gameState?.phase === 'hole_end' ? 'next_hole' : 'start_game' }));
turnEdit.addEventListener('click', () => openEditor());

function renderSettings(): void {
  sensitivityValue.textContent = `${sensitivityInput.value} %`;
}
sensitivityInput.addEventListener('input', renderSettings);

/** Two players cannot wear the same colour (yet): if someone else has ours, take a free one. */
function freeColour(): void {
  const taken = new Set(otherPlayers.map((p) => p.colour));
  if (taken.has(profile.colour)) {
    profile.colour = SHIRT_COLOURS.find((c) => !taken.has(c)) ?? profile.colour;
    preview.setLook(characterLook());
  }
}

// ---------- Character ----------

function characterLook(): { shirt: string; skin: string; handedness: Handedness; look: AvatarLook } {
  return { shirt: profile.colour, skin: profile.skinTone, handedness: profile.handedness, look: profile.look };
}

const preview = createAvatarPreview(characterLook());

/** Live updates to the big screen while editing: at most one per sendIntervalMs, the last one always goes out. */
let lookTimer: number | undefined;
let lastLookSent = 0;
let pendingLook: EditorState | null = null;

function sendLook(state: EditorState, saved = false): void {
  pendingLook = state;
  const wait = TUNING.avatarEditor.sendIntervalMs - (performance.now() - lastLookSent);
  if (saved || wait <= 0) flushLook(saved);
  else if (lookTimer === undefined) lookTimer = window.setTimeout(() => flushLook(false), wait);
}

function flushLook(saved: boolean): void {
  clearTimeout(lookTimer);
  lookTimer = undefined;
  if (!pendingLook) return;
  const s = pendingLook;
  pendingLook = null;
  lastLookSent = performance.now();
  send({ type: 'set_look', colour: s.colour, skinTone: s.skin, handedness: s.handedness, look: s.look, saved });
}

/** Keeps the edited look on this phone (localStorage) and tells the game screens that use the hand. */
function keepLook(state: EditorState): void {
  profile.colour = state.colour;
  profile.skinTone = state.skin;
  profile.handedness = state.handedness;
  profile.look = state.look;
  saveProfile(profile);
  lab.setHandedness(profile.handedness);
}

function inLobby(): boolean {
  return !gameState || gameState.phase === 'lobby' || gameState.phase === 'game_end';
}

function openEditor(): void {
  if (!inLobby()) return;
  joined = true;
  play.cancel();
  editor.open(
    { colour: profile.colour, skin: profile.skinTone, handedness: profile.handedness, look: profile.look },
    room ? `${profile.name} · Room ${room}` : profile.name,
  );
  editor.setTaken(otherPlayers.map((p) => p.colour));
  show('editor');
}

function closeEditor(state: EditorState, saved: boolean): void {
  keepLook(state);
  sendLook(state, saved);
  preview.mount(joinAvatar);
  showJoined();
}

const editor = initEditor(preview, {
  onChange: (state) => sendLook(state),
  onSave: (state) => closeEditor(state, true),
  onBack: (state) => closeEditor(state, false),
});

const JOIN_ERROR_TEXT: Partial<Record<JoinError, string>> = {
  // (colour_taken: the phone already avoids taken colours, so this only happens in a rare race)
  colour_taken: 'Someone just took that colour. Pick another one.',
  invalid: `Please type a name (up to ${NAME_MAX_LENGTH} letters).`,
};

function handleJoinError(reason: JoinError): void {
  switch (reason) {
    case 'not_joined':
      showJoinForm();
      break;
    case 'wrong_room':
      showRoomForm(`There is no game with the code ${room}. Check the code on the big screen.`);
      break;
    case 'replaced':
      stopped = true;
      showMessage('Opened somewhere else', 'You joined from another tab or window. Use that one to play.');
      break;
    case 'game_full':
      showMessage('The game is full', 'Up to 4 players can join. Wait for the next game.');
      break;
    case 'room_reset':
      // The big screen started a new room: type its new code (the name and character are kept on this phone).
      play.cancel();
      gameState = null;
      showRoomForm('The big screen started a new room. Type the new code, or scan the new QR code.');
      break;
    case 'kicked':
      // Removed by the big screen: this phone forgets the room code, so coming back means typing it (or scanning) again.
      play.cancel();
      gameState = null;
      room = null;
      roomInput.value = '';
      history.replaceState(null, '', '/play');
      showRoomForm('You were removed from the game. To play again, type the room code from the big screen.');
      break;
    default:
      showJoinForm(JOIN_ERROR_TEXT[reason]);
  }
}

// ---------- Connection ----------

function send(msg: ClientMessage): void {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

const play = initPlayScreen(send);
const lab = initLabScreen(send);
const ski = initSkiScreen(send);

function connect(): void {
  clearTimeout(reconnectTimer);
  const socket = new WebSocket(`wss://${location.host}${WS_PATH}`);
  ws = socket;
  socket.addEventListener('open', () => {
    reconnecting.hidden = true;
    if (room) send({ type: 'rejoin', room, playerId: profile.playerId });
  });
  socket.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data) as ServerMessage;
    switch (msg.type) {
      case 'joined':
        profile.name = msg.player.name;
        profile.colour = msg.player.colour;
        profile.skinTone = msg.player.skinTone;
        profile.handedness = msg.player.handedness;
        profile.sensitivity = msg.player.sensitivity;
        profile.look = msg.player.look;
        saveProfile(profile);
        play.setSensitivity(profile.sensitivity);
        lab.setSensitivity(profile.sensitivity);
        ski.setSensitivity(profile.sensitivity);
        lab.setHandedness(profile.handedness);
        preview.setLook(characterLook());
        if (editorAfterJoin) {
          editorAfterJoin = false;
          openEditor();
        } else if (screens.editor.hidden) showJoined();
        break;
      case 'lobby_state':
        allPlayers = msg.players;
        otherPlayers = msg.players.filter((p) => p.id !== profile.playerId);
        if (!screens.join.hidden) freeColour();
        if (!screens.editor.hidden) editor.setTaken(otherPlayers.map((p) => p.colour));
        renderTurn();
        break;
      case 'game_state': {
        // My ball just dropped in: a happy buzz (a longer one for a hole in one). Android only; iPhone cannot vibrate.
        const before = gameState?.players.find((p) => p.id === profile.playerId);
        const now = msg.players.find((p) => p.id === profile.playerId);
        if (now?.done === 'holed' && before?.done !== 'holed' && msg.hole === gameState?.hole && 'vibrate' in navigator) {
          navigator.vibrate(now.strokes === 1 ? [120, 60, 120, 60, 120, 60, 400] : [80, 60, 200]);
        }
        gameState = msg;
        // The game started while this player was still editing: keep the look and go to the controls.
        if (!screens.editor.hidden && !inLobby()) {
          preview.mount(joinAvatar);
          showJoined();
        }
        renderTurn();
        break;
      }
      case 'join_error':
        handleJoinError(msg.reason);
        break;
      case 'lab_state':
        labOpen = msg.on;
        renderLab();
        break;
      case 'curling_state':
        curlingOpen = msg.on;
        renderTurn();
        break;
      case 'ski_state':
        skiOpen = msg.on;
        renderSki();
        break;
      case 'ski_cue':
        ski.onCue(msg.cue, msg.time, msg.place);
        break;
      case 'clock_pong':
        lab.onClockPong(msg.t, msg.server);
        break;
      case 'badminton_cue':
        lab.onCue(msg.cue);
        break;
    }
  });
  socket.addEventListener('close', () => {
    if (ws !== socket || stopped) return;
    ws = null;
    if (joined) reconnecting.hidden = false;
    else if (screens.join.hidden) showMessage('Connecting…', 'Make sure this phone is on the same Wi-Fi as the big screen.');
    reconnectTimer = window.setTimeout(connect, TUNING.network.reconnectDelayMs);
  });
}

roomInput.addEventListener('input', () => {
  roomInput.value = roomInput.value.toUpperCase().replace(/[^A-Z]/g, '');
});

roomForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const code = roomInput.value.trim().toUpperCase();
  if (code.length !== ROOM_CODE_LENGTH) {
    roomError.textContent = `The code has ${ROOM_CODE_LENGTH} letters.`;
    return;
  }
  roomInput.blur();
  room = code;
  history.replaceState(null, '', `/play?room=${code}`); // a reload keeps the room
  showMessage('Connecting…');
  if (ws?.readyState === WebSocket.OPEN) send({ type: 'rejoin', room, playerId: profile.playerId });
  else connect();
});

/** Join (or update name and sensitivity); the server answers with 'joined'. */
function sendJoin(): boolean {
  nameInput.blur();
  const name = nameInput.value.trim();
  if (!name) {
    joinError.textContent = JOIN_ERROR_TEXT.invalid!;
    return false;
  }
  void keepScreenAwake(); // must start from a tap
  if (!room) return false;
  freeColour();
  send({
    type: 'join',
    room,
    playerId: profile.playerId,
    name,
    colour: profile.colour,
    skinTone: profile.skinTone,
    handedness: profile.handedness,
    sensitivity: Number(sensitivityInput.value),
    look: profile.look,
  });
  return true;
}

joinForm.addEventListener('submit', (event) => {
  event.preventDefault();
  sendJoin();
});

// Customize: join first (so the character is on the big screen), then open the editor.
document.getElementById('customize')!.addEventListener('click', () => {
  if (!inLobby()) {
    joinError.textContent = 'You can change your character in the lobby, between games.';
    return;
  }
  if (sendJoin()) editorAfterJoin = true;
});

document.getElementById('change-profile')!.addEventListener('click', () => showJoinForm());
messageButton.addEventListener('click', () => showJoinForm());

// After the screen was locked, reconnect right away instead of waiting for the timer.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || stopped) return;
  if (joined) void keepScreenAwake();
  if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) connect();
});

// ---------- Keep the screen on ----------

let wakeLock: WakeLockSentinel | null = null;

async function keepScreenAwake(): Promise<void> {
  if (!('wakeLock' in navigator) || (wakeLock && !wakeLock.released)) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
  } catch {
    // Not allowed right now (e.g. low battery mode). The tip on the joined screen covers it.
  }
}

// ---------- Saved profile ----------

function loadProfile(): Profile {
  try {
    const saved = JSON.parse(localStorage.getItem(PROFILE_KEY) ?? 'null') as Partial<Profile> | null;
    if (saved && typeof saved.playerId === 'string') {
      return {
        playerId: saved.playerId,
        name: typeof saved.name === 'string' ? saved.name : '',
        colour: typeof saved.colour === 'string' ? saved.colour : SHIRT_COLOURS[0],
        skinTone: typeof saved.skinTone === 'string' ? saved.skinTone : SKIN_TONES[1],
        handedness: saved.handedness === 'left' ? 'left' : 'right',
        look: sanitizeLook(saved.look),
        sensitivity:
          typeof saved.sensitivity === 'number'
            ? Math.min(SENSITIVITY_MAX, Math.max(SENSITIVITY_MIN, saved.sensitivity))
            : SENSITIVITY_DEFAULT,
      };
    }
  } catch {
    // Storage blocked or corrupted: start fresh.
  }
  const fresh: Profile = {
    playerId: crypto.randomUUID(),
    name: '',
    colour: SHIRT_COLOURS[0],
    skinTone: SKIN_TONES[1],
    handedness: 'right',
    sensitivity: SENSITIVITY_DEFAULT,
    look: DEFAULT_LOOK,
  };
  saveProfile(fresh);
  return fresh;
}

function saveProfile(next: Profile): void {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(next));
  } catch {
    // Without storage the phone still works, it just cannot rejoin after a reload.
  }
}

// ---------- Start ----------

if (room) connect();
else showRoomForm();
