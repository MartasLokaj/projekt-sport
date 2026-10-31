import {
  EYES,
  GLASSES,
  HAIR_COLOURS,
  HAIR_STYLES,
  HATS,
  MOUTHS,
  randomAvatar,
  type AvatarLook,
} from '../../shared/avatar.ts';
import { SHIRT_COLOURS, SKIN_TONES, type Handedness } from '../../shared/protocol.ts';
import type { AvatarPreview } from './preview.ts';

// The character editor on the phone: four tabs (Face, Hair, Clothes, Gear), Random and Save & play,
// laid out as in the approved design. Every tap changes the 3D preview and is reported with onChange
// (main.ts sends it to the big screen, so the character there changes live).

export type EditorState = { colour: string; skin: string; handedness: Handedness; look: AvatarLook };

type Tab = 'face' | 'hair' | 'clothes' | 'gear';
type Choice = { value: string; label: string; colour?: string };
type Group = {
  label: string;
  swatches?: boolean;
  note?: string;
  choices: Choice[];
  get: (s: EditorState) => string;
  set: (s: EditorState, value: string) => void;
};

const chips = (list: readonly { id: string; label: string }[]): Choice[] => list.map((o) => ({ value: o.id, label: o.label }));
const colours = (list: readonly string[], name: string): Choice[] =>
  list.map((hex, i) => ({ value: hex, label: `${name} ${i + 1}`, colour: hex }));
const look = <K extends keyof AvatarLook>(key: K) => ({
  get: (s: EditorState) => String(s.look[key]),
  set: (s: EditorState, v: string) => {
    s.look = { ...s.look, [key]: v };
  },
});

const TABS: Record<Tab, Group[]> = {
  face: [
    { label: 'Skin', swatches: true, choices: colours(SKIN_TONES, 'Skin tone'), get: (s) => s.skin, set: (s, v) => (s.skin = v) },
    { label: 'Eyes', choices: chips(EYES), ...look('eyes') },
    { label: 'Mouth', choices: chips(MOUTHS), ...look('mouth') },
    {
      label: 'Cheeks',
      choices: [
        { value: 'yes', label: 'Blush' },
        { value: 'no', label: 'None' },
      ],
      get: (s) => (s.look.blush ? 'yes' : 'no'),
      set: (s, v) => (s.look = { ...s.look, blush: v === 'yes' }),
    },
  ],
  hair: [
    { label: 'Style', choices: chips(HAIR_STYLES), ...look('hairStyle') },
    {
      label: 'Colour',
      swatches: true,
      choices: HAIR_COLOURS.map((o) => ({ value: o.id, label: o.label, colour: o.id })),
      ...look('hairColour'),
    },
  ],
  clothes: [
    {
      label: 'Your colour',
      swatches: true,
      note: 'Each game dresses you in its own outfit in this colour.',
      choices: colours(SHIRT_COLOURS, 'Colour'),
      get: (s) => s.colour,
      set: (s, v) => (s.colour = v),
    },
    { label: 'Hat', choices: chips(HATS), ...look('hat') },
    { label: 'Glasses', choices: chips(GLASSES), ...look('glasses') },
  ],
  gear: [
    { label: 'Racket grip', swatches: true, choices: colours(SHIRT_COLOURS, 'Grip colour'), ...look('gripColour') },
    { label: 'Putter', swatches: true, choices: colours(SHIRT_COLOURS, 'Putter colour'), ...look('putterColour') },
    {
      label: 'I play with my',
      choices: [
        { value: 'right', label: 'Right hand' },
        { value: 'left', label: 'Left hand' },
      ],
      get: (s) => s.handedness,
      set: (s, v) => (s.handedness = v === 'left' ? 'left' : 'right'),
    },
  ],
};

export type Editor = {
  /** Opens the editor with this look; subtitle = "Ana · Room SEZN". */
  open(state: EditorState, subtitle: string): void;
  /** Colours other players already wear (they cannot be picked). */
  setTaken(colours: string[]): void;
};

export function initEditor(
  preview: AvatarPreview,
  callbacks: { onChange: (s: EditorState) => void; onSave: (s: EditorState) => void; onBack: (s: EditorState) => void },
): Editor {
  const stage = document.getElementById('ed-stage')!;
  const panel = document.getElementById('ed-panel')!;
  const subtitle = document.getElementById('ed-sub')!;
  const tabButtons = [...document.querySelectorAll<HTMLButtonElement>('.ed-tabs [data-tab]')];
  let state: EditorState | null = null;
  let tab: Tab = 'face';
  let taken = new Set<string>();

  function render(): void {
    if (!state) return;
    for (const b of tabButtons) b.setAttribute('aria-selected', String(b.dataset.tab === tab));
    panel.replaceChildren(
      ...TABS[tab].map((group) => {
        const el = document.createElement('div');
        el.className = 'ed-group';
        const label = document.createElement('div');
        label.className = 'ed-label';
        label.textContent = group.label;
        const options = document.createElement('div');
        options.className = group.swatches ? 'ed-options swatches' : 'ed-options';
        const current = group.get(state!);
        for (const choice of group.choices) {
          const b = document.createElement('button');
          b.type = 'button';
          b.setAttribute('aria-pressed', String(choice.value === current));
          if (choice.colour) {
            b.className = 'ed-swatch';
            b.style.background = choice.colour;
            b.setAttribute('aria-label', choice.label);
            b.disabled = group.label === 'Your colour' && taken.has(choice.value);
          } else {
            b.className = 'ed-chip';
            b.textContent = choice.label;
          }
          b.addEventListener('click', () => {
            group.set(state!, choice.value);
            changed();
          });
          options.append(b);
        }
        el.append(label, options);
        if (group.note) {
          const note = document.createElement('div');
          note.className = 'ed-note';
          note.textContent = group.note;
          el.append(note);
        }
        return el;
      }),
    );
  }

  function changed(): void {
    if (!state) return;
    preview.setLook({ shirt: state.colour, skin: state.skin, handedness: state.handedness, look: state.look });
    render();
    callbacks.onChange({ ...state });
  }

  for (const b of tabButtons) {
    b.addEventListener('click', () => {
      tab = b.dataset.tab as Tab;
      panel.scrollTop = 0;
      render();
    });
  }

  document.getElementById('ed-random')!.addEventListener('click', () => {
    if (!state) return;
    const r = randomAvatar();
    const free: string[] = SHIRT_COLOURS.filter((c) => !taken.has(c));
    state.skin = r.skin;
    state.colour = free.includes(r.colour) ? r.colour : (free[Math.floor(Math.random() * free.length)] ?? state.colour);
    state.look = r.look;
    preview.play('cheer');
    changed();
  });
  document.getElementById('ed-save')!.addEventListener('click', () => {
    if (!state) return;
    preview.play('wave');
    callbacks.onSave({ ...state });
  });
  document.getElementById('ed-back')!.addEventListener('click', () => {
    if (state) callbacks.onBack({ ...state });
  });

  return {
    open(next, sub) {
      state = { ...next, look: { ...next.look } };
      subtitle.textContent = sub;
      preview.mount(stage);
      preview.faceFront();
      preview.setLook({ shirt: state.colour, skin: state.skin, handedness: state.handedness, look: state.look });
      render();
    },
    setTaken(colours) {
      taken = new Set(colours);
      if (state && taken.has(state.colour)) {
        // Someone else just took this colour: move to a free one.
        const free = SHIRT_COLOURS.find((c) => !taken.has(c));
        if (free) {
          state.colour = free;
          changed();
          return;
        }
      }
      render();
    },
  };
}
