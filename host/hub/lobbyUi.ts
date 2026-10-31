import { MAX_PLAYERS, type PlayerInfo } from '../../shared/protocol.ts';
import { TUNING } from '../../shared/tuning.ts';
import { FACES, type FaceInfo } from './faces.ts';

// The page parts of the Cube World lobby around the 3D cube: the join panel (QR code, room code, the
// players' seats), the chosen game's card (picture, facts, modes, Play button, dots to switch games)
// and short news toasts ("Ana joined"). Styles are in host/ui/lobby.css.

/** What the Play button would do for a game right now. */
export type PlayState = { enabled: boolean; label: string; note: string; warn: boolean };

const STATUS: Record<FaceInfo['status'], { text: string; tone: string }> = {
  ready: { text: 'Ready to play', tone: 'is-good' },
  prototype: { text: 'Prototype', tone: 'is-link' },
  soon: { text: 'Coming soon', tone: 'is-warn' },
};

export class LobbyUi {
  /** A dot under the game card was clicked: choose that game. */
  onChoose: (id: string) => void = () => {};

  private readonly $ = (id: string): HTMLElement => document.getElementById(id)!;
  private readonly pick = this.$('pick');
  private readonly hint = this.$('pick-hint');
  private readonly start = this.$('start') as HTMLButtonElement;
  private readonly dots: HTMLButtonElement[] = [];
  private players: PlayerInfo[] = [];
  private face: FaceInfo | null = null;
  /** Players seen so far and whether they were connected, to tell who joined, left or came back. */
  private readonly known = new Map<string, boolean>();
  /** When each player first appeared (ms), so a new seat says "Joining…" for a moment. */
  private readonly arrived = new Map<string, number>();
  private firstList = true;

  constructor() {
    const dots = this.$('pick-dots');
    for (const face of FACES) {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.style.setProperty('--dot', face.accent);
      dot.setAttribute('aria-label', face.title);
      dot.title = face.title;
      dot.addEventListener('click', () => this.onChoose(face.id));
      this.dots.push(dot);
      dots.append(dot);
    }
    this.renderSeats();
  }

  // ---------- Join panel ----------

  setRoom(room: string, qrDataUrl: string | null, joinUrl: string | null): void {
    this.$('room-code').replaceChildren(...[...room].map((ch) => el('span', '', ch)));
    this.$('room-code').setAttribute('aria-label', `Room code ${room}`);
    const qr = this.$('qr') as HTMLImageElement;
    qr.hidden = !qrDataUrl;
    this.$('qr-missing').hidden = !!qrDataUrl;
    if (qrDataUrl) qr.src = qrDataUrl;
    this.$('join-url').textContent = joinUrl ? `or open ${joinUrl.split('?')[0]} and type the code` : '';
  }

  /** The big screen's own link to the game server. */
  setOnline(online: boolean): void {
    const chip = this.$('link-status');
    chip.textContent = online ? 'Room open' : 'Reconnecting';
    chip.className = `cw-chip ${online ? 'is-good' : 'is-warn'}`;
  }

  setPlayers(players: PlayerInfo[]): void {
    const now = performance.now();
    for (const p of players) {
      const before = this.known.get(p.id);
      if (before === undefined) {
        this.arrived.set(p.id, now);
        if (!this.firstList) this.toast(p.colour, `${p.name} joined`);
      } else if (before && !p.connected) this.toast(p.colour, `${p.name} lost connection`);
      else if (!before && p.connected) this.toast(p.colour, `${p.name} is back`);
      this.known.set(p.id, p.connected);
    }
    for (const [id] of this.known) {
      if (players.some((p) => p.id === id)) continue;
      const gone = this.players.find((p) => p.id === id);
      if (gone) this.toast(gone.colour, `${gone.name} left`);
      this.known.delete(id);
      this.arrived.delete(id);
    }
    this.firstList = false;
    this.players = players;
    this.renderSeats();
    this.renderGame(false);
  }

  private renderSeats(): void {
    const list = this.$('joined');
    const previous = new Set([...list.querySelectorAll<HTMLElement>('[data-id]')].map((item) => item.dataset.id));
    const leader = this.players.find((p) => p.connected)?.id;
    const now = performance.now();
    const seats: HTMLElement[] = this.players.map((p, i) => {
      const item = el('li', 'seat');
      item.dataset.id = p.id;
      if (!previous.has(p.id)) item.classList.add('is-new');
      if (!p.connected) item.classList.add('is-away');
      const avatar = el('span', 'cw-avatar');
      avatar.style.setProperty('--shirt', p.colour);
      avatar.style.setProperty('--skin', p.skinTone);
      const text = el('span', 'seat-text');
      const detail = el('span', 'seat-detail');
      const joining = now - (this.arrived.get(p.id) ?? 0) < TUNING.lobbyUi.joiningMs;
      const [state, tone] = !p.connected ? ['Away', 'is-warn'] : joining ? ['Joining', 'is-link'] : ['Connected', 'is-good'];
      detail.append(el('span', `seat-state ${tone}`, state));
      text.append(el('span', 'seat-name', p.name), detail);
      const badge = p.id === leader ? el('span', 'seat-badge is-leader', '★ Leader') : el('span', 'seat-badge', `P${i + 1}`);
      if (p.id === leader) badge.title = 'Leader: the first connected player';
      item.append(avatar, text, badge);
      return item;
    });
    for (let i = this.players.length; i < MAX_PLAYERS; i++) {
      const item = el('li', 'seat is-empty');
      item.append(el('span', 'seat-slot', `P${i + 1}`), el('span', 'seat-name', i === this.players.length ? 'Waiting for a player…' : 'Free seat'));
      seats.push(item);
    }
    list.replaceChildren(...seats);
    this.$('player-count').textContent = `${this.players.filter((p) => p.connected).length} / ${MAX_PLAYERS} connected`;
    // Turn "Joining" into "Connected" once the moment has passed.
    const waiting = [...this.arrived.values()].filter((t) => now - t < TUNING.lobbyUi.joiningMs);
    if (waiting.length > 0) setTimeout(() => this.renderSeats(), TUNING.lobbyUi.joiningMs - (now - Math.min(...waiting)) + 20);
  }

  // ---------- Game card ----------

  /** The chosen game's card (it slides away and a hint shows while no game is chosen). */
  showGame(face: FaceInfo | null): void {
    const changed = face !== this.face;
    this.face = face;
    this.renderGame(changed);
  }

  /** What Play does for the chosen game, given who has joined. */
  playState(face: FaceInfo | null = this.face): PlayState {
    const phones = this.players.filter((p) => p.connected).length;
    if (!face) return { enabled: false, label: 'Play', note: '', warn: false };
    if (face.status === 'soon') return { enabled: false, label: 'Coming soon', note: 'This world is still being built', warn: false };
    if (face.id === 'badminton') {
      // Works without phones too: the Mac keyboard can swing (Space, ↑).
      const note = phones === 0 ? 'No phone yet: Space swings on the Mac' : phones > 2 ? 'The first two players play' : '';
      return { enabled: true, label: 'Play', note, warn: false };
    }
    if (phones < face.minPlayers) return { enabled: false, label: 'Play', note: 'Join with a phone to play', warn: true };
    return { enabled: true, label: 'Play', note: `${phones} ${phones === 1 ? 'player' : 'players'} ready`, warn: false };
  }

  private renderGame(changed: boolean): void {
    const face = this.face;
    this.pick.classList.toggle('away', !face);
    this.hint.classList.toggle('away', !!face);
    this.dots.forEach((dot, i) => dot.classList.toggle('is-current', FACES[i] === face));
    if (!face) return;
    this.pick.style.setProperty('--accent', face.accent);
    const status = STATUS[face.status];
    const chip = this.$('pick-status');
    chip.textContent = status.text;
    chip.className = `cw-chip ${status.tone}`;
    this.$('pick-title').textContent = face.title;
    this.$('pick-description').textContent = face.description;
    this.$('pick-players').textContent = face.minPlayers === face.maxPlayers ? `${face.maxPlayers}` : `${face.minPlayers}–${face.maxPlayers}`;
    this.$('pick-controls').textContent = face.controls;
    // Games that are not built yet have no facts or modes to show.
    (this.pick.querySelector('.pick-facts') as HTMLElement).hidden = face.status === 'soon';
    (this.pick.querySelector('.pick-modes') as HTMLElement).hidden = face.modes.length === 0;

    const phones = this.players.filter((p) => p.connected).length;
    const active = face.modes.findIndex((m) => phones >= m.players[0] && phones <= m.players[1]);
    const modes = face.modes.map((mode, i) => {
      const item = el('li', i === (active < 0 ? 0 : active) ? 'mode is-active' : 'mode');
      const text = el('div', '');
      text.append(el('b', '', mode.label), el('span', '', mode.detail));
      item.append(text);
      return item;
    });
    this.$('pick-modes').replaceChildren(...modes);

    const play = this.playState(face);
    this.start.disabled = !play.enabled;
    this.$('start-label').textContent = play.label;
    const note = this.$('pick-note');
    note.textContent = play.note;
    note.classList.toggle('is-warn', play.warn);

    if (changed) {
      const art = this.$('pick-art');
      art.querySelector('svg')?.remove();
      art.insertAdjacentHTML('beforeend', ICONS[face.icon]);
      for (const part of [art, this.pick.querySelector('.pick-head')!, this.pick.querySelector('.pick-facts')!, this.pick.querySelector('.pick-modes')!]) {
        part.classList.remove('swap-in');
        void (part as HTMLElement).offsetWidth; // restart the animation
        part.classList.add('swap-in');
      }
    }
  }

  /** The Play button looks pressed for a moment (when Enter starts the game). */
  pressPlay(): void {
    this.start.classList.add('is-pressed');
    setTimeout(() => this.start.classList.remove('is-pressed'), 140);
  }

  // ---------- Toasts ----------

  toast(colour: string, text: string): void {
    const toasts = this.$('toasts');
    const item = el('div', 'cw-toast');
    const dot = el('span', 'cw-toast-dot');
    dot.style.background = colour;
    item.append(dot, document.createTextNode(text));
    toasts.append(item);
    while (toasts.children.length > 3) toasts.firstElementChild!.remove();
    setTimeout(() => {
      item.classList.add('is-leaving');
      item.addEventListener('animationend', () => item.remove());
    }, TUNING.lobbyUi.toastMs);
  }
}

function el(tag: string, className: string, text = ''): HTMLElement {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = text;
  return element;
}

// Little pictures for the game cards (drawn here, so they are our own).
const ICONS: Record<FaceInfo['icon'], string> = {
  golf: `<svg viewBox="0 0 160 160" aria-hidden="true">
    <ellipse cx="80" cy="132" rx="70" ry="22" fill="#2fbf6d"/><ellipse cx="80" cy="128" rx="62" ry="17" fill="#55e08f"/>
    <ellipse cx="104" cy="127" rx="13" ry="5" fill="#123d2a"/>
    <rect x="101" y="30" width="5" height="98" rx="2.5" fill="#f3f5ff"/>
    <path d="M106 32 L146 46 L106 60 Z" fill="#ff5b6e"/>
    <circle cx="52" cy="120" r="11" fill="#ffffff"/><circle cx="48" cy="116" r="3" fill="#e4e8f5"/>
  </svg>`,
  shuttle: `<svg viewBox="0 0 160 160" aria-hidden="true">
    <g transform="rotate(-28 80 80)">
      <path d="M58 30 L102 30 L92 98 L68 98 Z" fill="#fff4ec"/>
      <path d="M66 30 L72 98 M80 30 L80 98 M94 30 L88 98" stroke="#ffd3bd" stroke-width="3"/>
      <path d="M60 52 L100 52 M63 76 L97 76" stroke="#ffc2a6" stroke-width="3"/>
      <rect x="64" y="96" width="32" height="10" rx="3" fill="#ff7a59"/>
      <path d="M64 106 Q80 136 96 106 Z" fill="#ff5b3a"/>
    </g>
  </svg>`,
  mystery: `<svg viewBox="0 0 160 160" aria-hidden="true">
    <rect x="34" y="34" width="92" height="92" rx="22" fill="#5b4fd6"/><rect x="34" y="34" width="92" height="46" rx="22" fill="#6f63ee"/>
    <text x="80" y="108" text-anchor="middle" font-family="Nunito Sans, sans-serif" font-weight="900" font-size="72" fill="#ffe36b">?</text>
    <path d="M22 132 L50 132 L36 108 Z" fill="#ff9f43"/><rect x="24" y="122" width="24" height="5" fill="#ffffff"/>
  </svg>`,
};
