import type { CharacterLook } from '../../host/game/character.ts';
import { DEFAULT_LOOK } from '../../shared/avatar.ts';

// A flat 2D drawing of the character (SVG), from the approved design canvas "Avatar editor – phone".
// Used on the phone when the 3D preview cannot run (no WebGL 2, or it failed), so the player always sees
// who they are editing.

const SVG_NS = 'http://www.w3.org/2000/svg';
const INK = '#1b1f2a';

export function chibiSvg(look: CharacterLook): string {
  const a = look.look ?? DEFAULT_LOOK;
  const skin = look.skin;
  const shirt = look.shirt;
  const hair = a.hairColour;
  const on = (v: boolean): string => (v ? '1' : '0');
  const capHair = `<path d="M40 98 Q36 30 100 30 Q164 30 160 98 Q156 66 130 60 Q112 74 92 64 Q60 62 44 98 Z"/>`;
  const covered = a.hat === 'cap' || a.hat === 'beanie';
  let hairShape = '';
  switch (a.hairStyle) {
    case 'short':
      hairShape = capHair;
      break;
    case 'spiky':
      hairShape = covered
        ? capHair
        : `<path d="M40 96 L42 62 L54 72 L58 40 L74 56 L82 26 L96 50 L108 22 L118 50 L132 30 L138 58 L150 42 L152 70 L160 62 L160 96 Q152 64 100 62 Q48 64 40 96 Z"/>`;
      break;
    case 'bob':
      hairShape = `<path d="M36 104 Q34 28 100 28 Q166 28 164 104 L164 128 Q150 122 150 92 Q140 62 100 62 Q60 62 50 92 Q50 122 36 128 Z"/>`;
      break;
    case 'pony':
      hairShape = capHair;
      break;
    case 'curly':
      hairShape = [
        [48, 80, 15], [58, 56, 16], [78, 40, 17], [102, 34, 17], [126, 40, 17], [145, 57, 16], [153, 81, 15], [90, 58, 13], [114, 58, 13],
      ]
        .map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`)
        .join('');
      break;
    case 'bun':
      hairShape = capHair + (covered ? '' : `<circle cx="100" cy="28" r="18"/>`);
      break;
  }
  const eye = (x: number, kind: string): string => {
    if (kind === 'round') return `<ellipse cx="${x}" cy="101" rx="7" ry="9" fill="${INK}"/><circle cx="${x + 2.5}" cy="97" r="2.5" fill="#fff"/>`;
    if (kind === 'sparkle')
      return `<ellipse cx="${x}" cy="101" rx="9" ry="11.5" fill="${INK}"/><circle cx="${x + 3}" cy="96" r="3.4" fill="#fff"/><circle cx="${x - 3}" cy="106" r="1.8" fill="#fff"/>`;
    if (kind === 'happy') return `<path d="M${x - 8} 104 Q${x} 92 ${x + 8} 104" fill="none" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>`;
    return `<path d="M${x - 8} 101 Q${x} 107 ${x + 8} 101" fill="none" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>`;
  };
  const eyes = a.eyes === 'wink' ? eye(78, 'round') + eye(122, 'happy') : eye(78, a.eyes) + eye(122, a.eyes);
  const mouth = {
    smile: `<path d="M90 122 Q100 132 110 122" fill="none" stroke="${INK}" stroke-width="3.5" stroke-linecap="round"/>`,
    grin: `<path d="M88 120 Q100 138 112 120 Z" fill="#7a2e3a"/><path d="M91 121 L109 121" stroke="#fff" stroke-width="3"/>`,
    oh: `<ellipse cx="100" cy="126" rx="5" ry="6.5" fill="#7a2e3a"/>`,
    cat: `<path d="M88 122 Q94 129 100 122 Q106 129 112 122" fill="none" stroke="${INK}" stroke-width="3.5" stroke-linecap="round"/>`,
  }[a.mouth];
  const glasses =
    a.glasses === 'round'
      ? `<g fill="none" stroke="${INK}" stroke-width="3.5"><circle cx="78" cy="101" r="15"/><circle cx="122" cy="101" r="15"/><path d="M93 100 Q100 95 107 100"/></g>`
      : a.glasses === 'sun'
        ? `<rect x="61" y="91" width="34" height="20" rx="9" fill="${INK}"/><rect x="105" y="91" width="34" height="20" rx="9" fill="${INK}"/><path d="M95 99 L105 99" stroke="${INK}" stroke-width="3.5"/>`
        : '';
  const hat =
    a.hat === 'cap'
      ? `<path d="M40 76 Q40 22 100 22 Q160 22 160 76 Z" fill="${shirt}"/><path d="M100 76 Q150 68 176 82 Q152 92 100 84 Z" fill="${shirt}"/><circle cx="100" cy="23" r="4.5" fill="#fff"/>`
      : a.hat === 'visor'
        ? `<path d="M40 68 Q100 54 160 68 L160 80 Q100 66 40 80 Z" fill="${shirt}"/><path d="M104 76 Q152 68 178 84 Q152 94 104 86 Z" fill="${shirt}"/>`
        : a.hat === 'beanie'
          ? `<path d="M38 82 Q38 18 100 18 Q162 18 162 82 Z" fill="${shirt}"/><rect x="35" y="70" width="130" height="17" rx="8.5" fill="#fff" opacity="0.88"/><circle cx="100" cy="16" r="11" fill="#fff"/>`
          : '';
  return `<svg xmlns="${SVG_NS}" viewBox="0 0 200 240" role="img" aria-label="Your character">
  <ellipse cx="100" cy="233" rx="56" ry="7" fill="#000" opacity="0.25"/>
  <rect x="76" y="196" width="20" height="30" rx="10" fill="${skin}"/><rect x="104" y="196" width="20" height="30" rx="10" fill="${skin}"/>
  <path d="M72 230 Q72 218 86 218 Q100 218 100 228 Q100 234 92 234 L78 234 Q72 234 72 230 Z" fill="#f3f5ff"/>
  <path d="M128 230 Q128 218 114 218 Q100 218 100 228 Q100 234 108 234 L122 234 Q128 234 128 230 Z" fill="#f3f5ff"/>
  <rect x="68" y="186" width="64" height="22" rx="9" fill="#34406b"/>
  <path d="M74 156 L62 172" stroke="${shirt}" stroke-width="20" stroke-linecap="round"/><path d="M126 156 L138 172" stroke="${shirt}" stroke-width="20" stroke-linecap="round"/>
  <path d="M62 174 L57 186" stroke="${skin}" stroke-width="14" stroke-linecap="round"/><path d="M138 174 L143 186" stroke="${skin}" stroke-width="14" stroke-linecap="round"/>
  <circle cx="56" cy="189" r="10" fill="${skin}"/><circle cx="144" cy="189" r="10" fill="${skin}"/>
  <path d="M64 170 Q64 144 100 144 Q136 144 136 170 L136 192 Q136 200 128 200 L72 200 Q64 200 64 192 Z" fill="${shirt}"/>
  <path d="M88 146 Q100 156 112 146" fill="none" stroke="#fff" stroke-opacity="0.55" stroke-width="3" stroke-linecap="round"/>
  ${a.hairStyle === 'pony' ? `<ellipse cx="160" cy="70" rx="15" ry="26" transform="rotate(20 160 70)" fill="${hair}"/>` : ''}
  <circle cx="40" cy="98" r="10" fill="${skin}"/><circle cx="160" cy="98" r="10" fill="${skin}"/>
  <circle cx="100" cy="92" r="60" fill="${skin}"/>
  <g fill="${hair}">${hairShape}</g>
  <g opacity="${on(a.blush)}"><ellipse cx="66" cy="117" rx="9" ry="5" fill="#ff8fa3" opacity="0.55"/><ellipse cx="134" cy="117" rx="9" ry="5" fill="#ff8fa3" opacity="0.55"/></g>
  ${eyes}${mouth}${glasses}${hat}
</svg>`;
}
