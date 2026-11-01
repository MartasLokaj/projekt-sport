import type { PlayerInfo } from '../../shared/protocol.ts';
import { TUNING } from '../../shared/tuning.ts';
import { FACES, type FaceInfo } from './faces.ts';

// The page parts of the Cube World lobby around the 3D cube: the join panel (QR code, room code) and
// the chosen game's card (picture, facts, modes, Play button, dots to switch games). Both only show
// while a game is chosen. The players themselves are shown only as characters on the cube, and as little
// faces under the Play button: hover a face for a × that kicks that player (after a confirm dialog).
// Styles are in host/ui/lobby.css.

/** The computer's difficulty, chosen in a "Versus CPU" mode row. */
export type CpuLevel = 'easy' | 'normal' | 'pro';
const LEVELS: { id: CpuLevel; label: string; key: string }[] = [
  { id: 'easy', label: 'Easy', key: '1' },
  { id: 'normal', label: 'Normal', key: '2' },
  { id: 'pro', label: 'Pro', key: '3' },
];

/** How long a match lasts, chosen in the card (badminton: see TUNING.badminton.matchLengths). */
export type MatchLength = keyof typeof TUNING.badminton.matchLengths;

/** "first to 11, win by 2, max 15" */
function lengthText(length: MatchLength): string {
  const m = TUNING.badminton.matchLengths[length];
  return `first to ${m.to}, win by ${m.winBy}${m.cap === null ? '' : `, max ${m.cap}`}`;
}

/** Which minigolf course, chosen in the card (see TUNING.rules.courses). */
export type CourseId = keyof typeof TUNING.rules.courses;

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
  /** The host confirmed kicking this player. */
  onKick: (playerId: string) => void = () => {};
  /** The computer's difficulty for the next match against it (Easy / Normal / Pro in the mode row, or keys 1 2 3). */
  cpuLevel: CpuLevel = 'normal';
  /** The match length for the next match (Quick / Normal / Long in the card's Match row). */
  matchLength: MatchLength = TUNING.badminton.matchLength;
  /** The minigolf course for the next game (3 holes / 9 holes in the card's Course row). */
  course: CourseId = Object.keys(TUNING.rules.courses)[0] as CourseId;

  private readonly $ = (id: string): HTMLElement => document.getElementById(id)!;
  private readonly pick = this.$('pick');
  private readonly hint = this.$('pick-hint');
  private readonly join = this.$('join');
  private readonly start = this.$('start') as HTMLButtonElement;
  private readonly dots: HTMLButtonElement[] = [];
  private players: PlayerInfo[] = [];
  private face: FaceInfo | null = null;
  private readonly kickDialog = this.$('kick-confirm');
  /** The player the kick dialog asks about. */
  private kickId: string | null = null;

  constructor() {
    this.$('kick-yes').addEventListener('click', () => this.answerKick(true));
    this.$('kick-cancel').addEventListener('click', () => this.answerKick(false));
    this.kickDialog.addEventListener('click', (e) => {
      if (e.target === this.kickDialog) this.answerKick(false); // a click outside the panel
    });
    const dots = this.$('pick-dots');
    for (const face of FACES) {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.innerHTML = ICONS[face.icon];
      dot.style.setProperty('--dot', face.accent);
      dot.setAttribute('aria-label', face.title);
      dot.title = face.title;
      dot.addEventListener('click', () => this.onChoose(face.id));
      this.dots.push(dot);
      dots.append(dot);
    }
  }

  // ---------- Join panel ----------

  setRoom(room: string, qrDataUrl: string | null, joinUrl: string | null): void {
    this.$('room-code').replaceChildren(...[...room].map((ch) => el('span', '', ch)));
    this.$('room-code').setAttribute('aria-label', `Room code ${room}`);
    const qr = this.$('qr') as HTMLImageElement;
    qr.hidden = !qrDataUrl;
    this.$('qr-missing').hidden = !!qrDataUrl;
    if (qrDataUrl) qr.src = qrDataUrl;
    // The address gets its own line, so it never breaks in the middle of a word.
    const url = this.$('join-url');
    if (joinUrl) url.replaceChildren('or open', el('span', 'join-address', joinUrl.split('?')[0]), 'and type the code');
    else url.replaceChildren();
  }

  /** The big screen's own link to the game server. */
  setOnline(online: boolean): void {
    const chip = this.$('link-status');
    chip.textContent = online ? 'Room open' : 'Reconnecting';
    chip.className = `cw-chip ${online ? 'is-good' : 'is-warn'}`;
  }

  /** Who has joined (changes which mode is lit and whether Play works). */
  setPlayers(players: PlayerInfo[]): void {
    this.players = players;
    // Once everyone who joined is connected, the join panel shrinks to a small QR for latecomers.
    this.join.classList.toggle('is-compact', players.length > 0 && players.every((p) => p.connected));
    this.renderFaces();
    this.renderGame(false);
  }

  /**
   * The joined players' little faces under the Play button (a player who lost connection is faded).
   * Hovering a face shows a × to kick that player. A face whose player left (or was kicked) spins away.
   */
  private renderFaces(): void {
    const row = this.$('pick-faces');
    const ids = new Set(this.players.map((p) => p.id));
    for (const slot of row.querySelectorAll<HTMLElement>('.face-slot')) {
      if (ids.has(slot.dataset.id!) || slot.classList.contains('is-leaving')) continue;
      slot.classList.add('is-leaving');
      setTimeout(() => slot.remove(), 520);
    }
    for (const p of this.players) {
      let slot = row.querySelector<HTMLElement>(`.face-slot[data-id="${CSS.escape(p.id)}"]:not(.is-leaving)`);
      if (!slot) {
        slot = el('span', 'face-slot');
        slot.dataset.id = p.id;
        const kick = el('button', 'face-kick', '×') as HTMLButtonElement;
        kick.type = 'button';
        kick.addEventListener('click', () => this.askKick(p.id));
        slot.append(el('span', 'cw-avatar'), kick);
        row.append(slot);
      }
      const face = slot.querySelector<HTMLElement>('.cw-avatar')!;
      face.classList.toggle('is-away', !p.connected);
      face.style.setProperty('--shirt', p.colour);
      face.style.setProperty('--skin', p.skinTone);
      face.title = p.connected ? p.name : `${p.name} (away)`;
      face.setAttribute('aria-label', face.title);
      const kick = slot.querySelector<HTMLElement>('.face-kick')!;
      kick.title = `Kick ${p.name}`;
      kick.setAttribute('aria-label', `Kick ${p.name}`);
    }
  }

  /** The Match row (Quick / Normal / Long) or the Course row (3 holes / 9 holes) under the modes, for games that have it. */
  private renderLengths(face: FaceInfo): void {
    const row = this.$('pick-length');
    row.hidden = !face.matchLengths && !face.courses;
    this.$('pick-length-label').textContent = face.courses ? 'Course' : 'Match';
    row.querySelector('.mode-levels')!.setAttribute('aria-label', face.courses ? 'Course' : 'Match length');
    if (face.courses) {
      const buttons = (Object.keys(TUNING.rules.courses) as CourseId[]).map((id) => {
        const button = el('button', id === this.course ? 'is-on' : '', TUNING.rules.courses[id].label) as HTMLButtonElement;
        button.type = 'button';
        button.title = TUNING.rules.courses[id].detail;
        button.setAttribute('role', 'radio');
        button.setAttribute('aria-checked', String(id === this.course));
        button.addEventListener('click', () => {
          this.course = id;
          this.renderGame(false);
        });
        return button;
      });
      row.querySelector('.mode-levels')!.replaceChildren(...buttons);
      return;
    }
    if (!face.matchLengths) return;
    const buttons = (Object.keys(TUNING.badminton.matchLengths) as MatchLength[]).map((id) => {
      const button = el('button', id === this.matchLength ? 'is-on' : '', TUNING.badminton.matchLengths[id].label) as HTMLButtonElement;
      button.type = 'button';
      button.title = lengthText(id);
      button.setAttribute('role', 'radio');
      button.setAttribute('aria-checked', String(id === this.matchLength));
      button.addEventListener('click', () => {
        this.matchLength = id;
        this.renderGame(false);
      });
      return button;
    });
    row.querySelector('.mode-levels')!.replaceChildren(...buttons);
  }

  setCpuLevel(level: CpuLevel): void {
    this.cpuLevel = level;
    this.renderGame(false);
  }

  /** Keys 1 2 3 choose the computer's level while a game with a Versus CPU mode is chosen. */
  handleLevelKey(e: KeyboardEvent): boolean {
    const level = LEVELS.find((l) => l.key === e.key);
    if (!level || !this.face?.modes.some((m) => m.levels)) return false;
    this.setCpuLevel(level.id);
    return true;
  }

  // ---------- Kick dialog ----------

  get kickOpen(): boolean {
    return !this.kickDialog.hidden;
  }

  private askKick(playerId: string): void {
    const player = this.players.find((p) => p.id === playerId);
    if (!player) return;
    this.kickId = playerId;
    this.$('kick-title').textContent = `Kick ${player.name}?`;
    this.$('kick-text').textContent = `${player.name} will be removed from the game. They can join again from their phone.`;
    this.kickDialog.hidden = false;
    this.$('kick-yes').focus();
  }

  /** Keys while the kick dialog is open: Enter kicks, Esc cancels. */
  handleKickKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') this.answerKick(false);
    else if (e.key === 'Enter') this.answerKick(true);
  }

  private answerKick(kick: boolean): void {
    const id = this.kickId;
    this.kickId = null;
    this.kickDialog.hidden = true;
    if (kick && id) this.onKick(id);
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
      const note = phones === 0 ? 'No phone yet: Space swings on the Mac' : phones > 2 ? 'The first two play' : '';
      return { enabled: true, label: 'Play', note, warn: false };
    }
    if (phones < face.minPlayers) return { enabled: false, label: 'Play', note: 'Join with a phone to play', warn: true };
    return { enabled: true, label: 'Play', note: '', warn: false };
  }

  private renderGame(changed: boolean): void {
    const face = this.face;
    this.pick.classList.toggle('away', !face);
    this.hint.classList.toggle('away', !!face);
    // Joining only makes sense for a game that can be played.
    this.join.classList.toggle('away', !face || face.status === 'soon');
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
    this.$('pick-faces').hidden = face.status === 'soon';

    const phones = this.players.filter((p) => p.connected).length;
    const active = face.modes.findIndex((m) => phones >= m.players[0] && phones <= m.players[1]);
    const modes = face.modes.map((mode, i) => {
      const item = el('li', i === (active < 0 ? 0 : active) ? 'mode is-active' : 'mode');
      const text = el('div', '');
      text.append(el('b', '', mode.label), el('span', '', mode.detail.replace('{length}', lengthText(this.matchLength)).replace('{course}', TUNING.rules.courses[this.course].detail)));
      item.append(text);
      if (mode.levels) {
        // Easy / Normal / Pro for the computer, right in its mode row.
        const levels = el('div', 'mode-levels');
        levels.setAttribute('role', 'radiogroup');
        levels.setAttribute('aria-label', 'Computer level');
        for (const level of LEVELS) {
          const button = el('button', level.id === this.cpuLevel ? 'is-on' : '', level.label) as HTMLButtonElement;
          button.type = 'button';
          button.title = `${level.label} (key ${level.key})`;
          button.setAttribute('role', 'radio');
          button.setAttribute('aria-checked', String(level.id === this.cpuLevel));
          button.addEventListener('click', () => this.setCpuLevel(level.id));
          levels.append(button);
        }
        item.append(levels);
      }
      return item;
    });
    this.$('pick-modes').replaceChildren(...modes);
    this.renderLengths(face);

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
