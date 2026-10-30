import {
  NAME_MAX_LENGTH,
  ROOM_CODE_LENGTH,
  SHIRT_COLOURS,
  WS_PATH,
  type ClientMessage,
  type JoinError,
  type PlayerInfo,
  type ServerMessage,
} from '../shared/protocol.ts';
import { TUNING } from '../shared/tuning.ts';
import { initPlayScreen } from './play.ts';

// The phone controller: join the game (room code from the QR code link, or typed in),
// stay joined through screen locks and Wi-Fi blips, then aim and hit on the play screen.

type Profile = { playerId: string; name: string; colour: string };

const PROFILE_KEY = 'minigolf.profile';

let room = new URLSearchParams(location.search).get('room')?.toUpperCase() ?? null;
const profile = loadProfile();

const screens = {
  message: document.getElementById('screen-message')!,
  room: document.getElementById('screen-room')!,
  join: document.getElementById('screen-join')!,
  play: document.getElementById('screen-play')!,
};
const messageTitle = document.getElementById('message-title')!;
const messageText = document.getElementById('message-text')!;
const roomForm = document.getElementById('room-form') as HTMLFormElement;
const roomInput = document.getElementById('room-code') as HTMLInputElement;
const roomError = document.getElementById('room-error')!;
const joinForm = document.getElementById('join-form') as HTMLFormElement;
const nameInput = document.getElementById('name') as HTMLInputElement;
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
let otherPlayers: PlayerInfo[] = [];

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
  roomError.textContent = error;
  show('room');
}

function showJoinForm(error = ''): void {
  joined = false;
  if (!nameInput.value) nameInput.value = profile.name;
  joinError.textContent = error;
  renderColours();
  show('join');
}

function showJoined(player: PlayerInfo): void {
  joined = true;
  meDot.style.background = player.colour;
  meName.textContent = player.name;
  wakeTip.hidden = 'wakeLock' in navigator;
  show('play');
  play.onJoined();
}

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
        saveProfile(profile);
        showJoined(msg.player);
        break;
      case 'lobby_state':
        otherPlayers = msg.players.filter((p) => p.id !== profile.playerId);
        if (!screens.join.hidden) renderColours();
        break;
      case 'join_error':
        handleJoinError(msg.reason);
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
  send({ type: 'join', room, playerId: profile.playerId, name, colour: selectedColour });
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
      };
    }
  } catch {
    // Storage blocked or corrupted: start fresh.
  }
  const fresh = { playerId: crypto.randomUUID(), name: '', colour: SHIRT_COLOURS[0] };
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
