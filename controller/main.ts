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
import { TUNING } from '../shared/tuning.ts';
import { initLabScreen } from './badminton/lab.ts';
import { initPlayScreen } from './play.ts';

// The phone controller: join the game (room code from the QR code link, or typed in),
// stay joined through screen locks and Wi-Fi blips, then aim and hit on the play screen.

type Profile = {
  playerId: string;
  name: string;
  colour: string;
  skinTone: string;
  handedness: Handedness;
  sensitivity: number;
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
};
const messageTitle = document.getElementById('message-title')!;
const messageText = document.getElementById('message-text')!;
const roomForm = document.getElementById('room-form') as HTMLFormElement;
const roomInput = document.getElementById('room-code') as HTMLInputElement;
const roomError = document.getElementById('room-error')!;
const joinForm = document.getElementById('join-form') as HTMLFormElement;
const nameInput = document.getElementById('name') as HTMLInputElement;
const skinsEl = document.getElementById('skins')!;
const handButtons = [...document.querySelectorAll<HTMLButtonElement>('#hands button')];
const sensitivityInput = document.getElementById('sensitivity') as HTMLInputElement;
const sensitivityValue = document.getElementById('sensitivity-value')!;
const coloursEl = document.getElementById('colours')!;
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
let selectedColour: string = profile.colour;
let selectedHand: Handedness = profile.handedness;
let selectedSkin: string = profile.skinTone;
let otherPlayers: PlayerInfo[] = [];
let allPlayers: PlayerInfo[] = [];
let gameState: GameState | null = null;
let lastTurn = -1;
/** The big screen has the Badminton Swing Lab open. */
let labOpen = false;

// ---------- Screens ----------

function show(screen: keyof typeof screens): void {
  for (const [name, el] of Object.entries(screens)) el.hidden = name !== screen;
}

function showMessage(title: string, text = ''): void {
  messageTitle.textContent = title;
  messageText.textContent = text;
  show('message');
}

function showRoomForm(error = ''): void {
  joined = false;
  lab.setOpen(false);
  roomError.textContent = error;
  show('room');
}

function showJoinForm(error = ''): void {
  joined = false;
  lab.setOpen(false);
  if (!nameInput.value) nameInput.value = profile.name;
  selectedHand = profile.handedness;
  selectedSkin = profile.skinTone;
  sensitivityInput.value = String(profile.sensitivity);
  renderSettings();
  joinError.textContent = error;
  renderColours();
  show('join');
}

function showJoined(player: PlayerInfo): void {
  joined = true;
  meDot.style.background = player.colour;
  meName.textContent = player.name;
  wakeTip.hidden = 'wakeLock' in navigator;
  show(labOpen ? 'lab' : 'play');
  lab.setOpen(labOpen);
  play.onJoined();
  renderTurn();
}

/** While joined, the lab replaces the play screen. */
function renderLab(): void {
  lab.setOpen(joined && labOpen);
  if (!joined) return;
  if (labOpen) play.cancel();
  show(labOpen ? 'lab' : 'play');
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

  if (state.phase === 'lobby') {
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
turnEdit.addEventListener('click', () => showJoinForm());

function renderSettings(): void {
  skinsEl.replaceChildren();
  for (const tone of SKIN_TONES) {
    const swatch = document.createElement('button');
    swatch.type = 'button';
    swatch.className = 'swatch';
    swatch.style.background = tone;
    swatch.classList.toggle('selected', tone === selectedSkin);
    swatch.setAttribute('aria-label', `Skin tone ${tone}`);
    swatch.addEventListener('click', () => {
      selectedSkin = tone;
      renderSettings();
    });
    skinsEl.append(swatch);
  }
  for (const button of handButtons) button.classList.toggle('selected', button.dataset.hand === selectedHand);
  sensitivityValue.textContent = `${sensitivityInput.value} %`;
}

for (const button of handButtons) {
  button.addEventListener('click', () => {
    selectedHand = button.dataset.hand === 'left' ? 'left' : 'right';
    renderSettings();
  });
}
sensitivityInput.addEventListener('input', renderSettings);

function renderColours(): void {
  const taken = new Set(otherPlayers.map((p) => p.colour));
  if (taken.has(selectedColour)) selectedColour = SHIRT_COLOURS.find((c) => !taken.has(c)) ?? selectedColour;
  coloursEl.replaceChildren();
  for (const colour of SHIRT_COLOURS) {
    const swatch = document.createElement('button');
    swatch.type = 'button';
    swatch.className = 'swatch';
    swatch.style.background = colour;
    swatch.disabled = taken.has(colour);
    swatch.classList.toggle('selected', colour === selectedColour);
    swatch.setAttribute('aria-label', `Shirt colour ${colour}`);
    swatch.addEventListener('click', () => {
      selectedColour = colour;
      renderColours();
    });
    coloursEl.append(swatch);
  }
}

const JOIN_ERROR_TEXT: Partial<Record<JoinError, string>> = {
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
        saveProfile(profile);
        play.setSensitivity(profile.sensitivity);
        lab.setSensitivity(profile.sensitivity);
        lab.setHandedness(profile.handedness);
        showJoined(msg.player);
        break;
      case 'lobby_state':
        allPlayers = msg.players;
        otherPlayers = msg.players.filter((p) => p.id !== profile.playerId);
        if (!screens.join.hidden) renderColours();
        renderTurn();
        break;
      case 'game_state':
        gameState = msg;
        renderTurn();
        break;
      case 'join_error':
        handleJoinError(msg.reason);
        break;
      case 'lab_state':
        labOpen = msg.on;
        renderLab();
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

joinForm.addEventListener('submit', (event) => {
  event.preventDefault();
  nameInput.blur();
  const name = nameInput.value.trim();
  if (!name) {
    joinError.textContent = JOIN_ERROR_TEXT.invalid!;
    return;
  }
  void keepScreenAwake(); // must start from a tap
  if (!room) return;
  send({
    type: 'join',
    room,
    playerId: profile.playerId,
    name,
    colour: selectedColour,
    skinTone: selectedSkin,
    handedness: selectedHand,
    sensitivity: Number(sensitivityInput.value),
  });
});

document.getElementById('change-profile')!.addEventListener('click', () => showJoinForm());

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
