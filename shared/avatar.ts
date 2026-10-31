// The player's character (avatar): every option the phone editor offers, the ready-made characters,
// and one check that turns anything (an old saved profile, a message from a phone) into a valid look.
// Used by the server (validation), the host (building the 3D character) and the phone (editor, storage).
// Colours are stored as their hex value; that hex is also the colour's id.

import { SHIRT_COLOURS, SKIN_TONES, type Handedness } from './protocol.ts';

export const AVATAR_VERSION = 1;

type Option<Id extends string> = { readonly id: Id; readonly label: string };

export const EYES = [
  { id: 'round', label: 'Round' },
  { id: 'sparkle', label: 'Sparkly' },
  { id: 'happy', label: 'Happy' },
  { id: 'sleepy', label: 'Sleepy' },
  { id: 'wink', label: 'Wink' },
] as const satisfies readonly Option<string>[];

export const MOUTHS = [
  { id: 'smile', label: 'Smile' },
  { id: 'grin', label: 'Grin' },
  { id: 'oh', label: 'Oh!' },
  { id: 'cat', label: 'Cat' },
] as const satisfies readonly Option<string>[];

export const HAIR_STYLES = [
  { id: 'short', label: 'Short' },
  { id: 'spiky', label: 'Spiky' },
  { id: 'bob', label: 'Bob' },
  { id: 'pony', label: 'Ponytail' },
  { id: 'curly', label: 'Curly' },
  { id: 'bun', label: 'Bun' },
] as const satisfies readonly Option<string>[];

export const HAIR_COLOURS = [
  { id: '#2b1d14', label: 'Dark brown' },
  { id: '#5a3825', label: 'Brown' },
  { id: '#a0632d', label: 'Auburn' },
  { id: '#e8c35a', label: 'Blonde' },
  { id: '#d9542f', label: 'Ginger' },
  { id: '#6b7cff', label: 'Blue' },
  { id: '#ff8fc8', label: 'Pink' },
] as const satisfies readonly Option<string>[];

/** Hats are always in the player's colour. */
export const HATS = [
  { id: 'none', label: 'None' },
  { id: 'cap', label: 'Cap' },
  { id: 'visor', label: 'Visor' },
  { id: 'beanie', label: 'Beanie' },
] as const satisfies readonly Option<string>[];

export const GLASSES = [
  { id: 'none', label: 'None' },
  { id: 'round', label: 'Round' },
  { id: 'sun', label: 'Sunglasses' },
] as const satisfies readonly Option<string>[];

export type Eyes = (typeof EYES)[number]['id'];
export type Mouth = (typeof MOUTHS)[number]['id'];
export type HairStyle = (typeof HAIR_STYLES)[number]['id'];
export type Hat = (typeof HATS)[number]['id'];
export type Glasses = (typeof GLASSES)[number]['id'];

/**
 * The parts of the look that the game itself does not care about (only the character shows them).
 * Name, player colour, skin tone and handedness travel next to it in PlayerInfo, as before.
 */
export type AvatarLook = {
  eyes: Eyes;
  mouth: Mouth;
  /** Rosy cheeks. */
  blush: boolean;
  hairStyle: HairStyle;
  hairColour: string;
  hat: Hat;
  glasses: Glasses;
  /** Badminton racket grip colour (one of SHIRT_COLOURS). */
  gripColour: string;
  /** Minigolf putter colour (one of SHIRT_COLOURS). */
  putterColour: string;
};

/** Everything the phone saves (localStorage) and sends when joining. */
export type AvatarProfile = AvatarLook & {
  v: typeof AVATAR_VERSION;
  name: string;
  /** The player's colour: outfits, hats and the phone's accents. One of SHIRT_COLOURS. */
  colour: string;
  /** One of SKIN_TONES. */
  skin: string;
  handedness: Handedness;
};

export const DEFAULT_LOOK: AvatarLook = {
  eyes: 'round',
  mouth: 'smile',
  blush: true,
  hairStyle: 'short',
  hairColour: '#5a3825',
  hat: 'none',
  glasses: 'none',
  gripColour: SHIRT_COLOURS[0],
  putterColour: SHIRT_COLOURS[1],
};

const ids = (list: readonly Option<string>[]): readonly string[] => list.map((o) => o.id);
function pick<T extends string>(value: unknown, allowed: readonly string[], fallback: T): T {
  return typeof value === 'string' && allowed.includes(value) ? (value as T) : fallback;
}

/** Any value (missing, old or broken) → a valid look. Unknown or missing fields get the defaults. */
export function sanitizeLook(raw: unknown): AvatarLook {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_LOOK;
  return {
    eyes: pick(r.eyes, ids(EYES), d.eyes),
    mouth: pick(r.mouth, ids(MOUTHS), d.mouth),
    blush: typeof r.blush === 'boolean' ? r.blush : d.blush,
    hairStyle: pick(r.hairStyle, ids(HAIR_STYLES), d.hairStyle),
    hairColour: pick(r.hairColour, ids(HAIR_COLOURS), d.hairColour),
    hat: pick(r.hat, ids(HATS), d.hat),
    glasses: pick(r.glasses, ids(GLASSES), d.glasses),
    gripColour: pick(r.gripColour, SHIRT_COLOURS, d.gripColour),
    putterColour: pick(r.putterColour, SHIRT_COLOURS, d.putterColour),
  };
}

/**
 * Any saved profile → a valid AvatarProfile. Works for the old phone profile too
 * (it had only colour, skinTone and handedness: the rest gets the defaults).
 */
export function sanitizeProfile(raw: unknown): AvatarProfile {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    ...sanitizeLook(r),
    v: AVATAR_VERSION,
    name: typeof r.name === 'string' ? r.name : '',
    colour: pick(r.colour, SHIRT_COLOURS, SHIRT_COLOURS[0]),
    skin: pick(r.skin ?? r.skinTone, SKIN_TONES, SKIN_TONES[1]),
    handedness: r.handedness === 'left' ? 'left' : 'right',
  };
}

/** The ready-made characters of the Quick start screen. */
export const PRESETS: readonly { id: string; label: string; skin: string; colour: string; look: AvatarLook }[] = [
  {
    id: 'sunny', label: 'Sunny', skin: '#f3c79a', colour: '#00a6ed',
    look: { ...DEFAULT_LOOK, hairStyle: 'short', hairColour: '#5a3825', eyes: 'round', mouth: 'smile', blush: true },
  },
  {
    id: 'skater', label: 'Skater', skin: '#8d5a34', colour: '#ff5a5f',
    look: { ...DEFAULT_LOOK, hairStyle: 'spiky', hairColour: '#2b1d14', eyes: 'sparkle', mouth: 'grin', blush: false, hat: 'cap' },
  },
  {
    id: 'bookworm', label: 'Bookworm', skin: '#ffe0c7', colour: '#9b5cff',
    look: { ...DEFAULT_LOOK, hairStyle: 'bob', hairColour: '#d9542f', eyes: 'round', mouth: 'oh', blush: true, glasses: 'round' },
  },
  {
    id: 'sporty', label: 'Sporty', skin: '#dba571', colour: '#3ec300',
    look: { ...DEFAULT_LOOK, hairStyle: 'pony', hairColour: '#e8c35a', eyes: 'happy', mouth: 'smile', blush: true, hat: 'visor' },
  },
  {
    id: 'captain', label: 'Captain', skin: '#5e3b22', colour: '#ffb400',
    look: { ...DEFAULT_LOOK, hairStyle: 'curly', hairColour: '#2b1d14', eyes: 'wink', mouth: 'grin', blush: false, glasses: 'sun' },
  },
  {
    id: 'dreamer', label: 'Dreamer', skin: '#b67b4c', colour: '#ff7ac6',
    look: { ...DEFAULT_LOOK, hairStyle: 'bun', hairColour: '#ff8fc8', eyes: 'sleepy', mouth: 'cat', blush: true, hat: 'beanie' },
  },
];

function any<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

/** "Random": everything random; glasses only sometimes. */
export function randomAvatar(): { skin: string; colour: string; look: AvatarLook } {
  return {
    skin: any(SKIN_TONES),
    colour: any(SHIRT_COLOURS),
    look: {
      eyes: any(EYES).id,
      mouth: any(MOUTHS).id,
      blush: Math.random() < 0.5,
      hairStyle: any(HAIR_STYLES).id,
      hairColour: any(HAIR_COLOURS).id,
      hat: any(HATS).id,
      glasses: Math.random() < 0.3 ? any(GLASSES.slice(1)).id : 'none',
      gripColour: any(SHIRT_COLOURS),
      putterColour: any(SHIRT_COLOURS),
    },
  };
}
