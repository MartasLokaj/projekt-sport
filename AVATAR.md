# Avatar system (SPEC Phase 5) — brief for Claude Code

Talk to the user in Czech. All in-game text in English. Plan first, wait for the user's OK, then build step by step; test on real phones after each step; commit, push and update progress/STATUS.md.

**Visual reference (approved by the user):** design canvas "Avatar editor – phone", https://claude.ai/artifact/7YFruszBSeiJZmFr9BWNiM
(3 phone screens: Quick start, Editor, Saved). It is a 2D sketch: in the game the characters stay our 3D chibis, built in code (`host/game/character.ts`). Match its layout, colours (Cube World theme tokens, Nunito Sans) and flow, not pixel by pixel.

## Decisions (from the user)
1. Editor on the **phone**; the character on the **TV updates live** while the player edits (in the lobby / on the cube).
2. Four tabs: **Face** (skin, eyes, mouth, cheeks), **Hair** (style, colour), **Clothes** (your colour, hat, glasses), **Gear** (racket grip colour, putter colour, right/left hand). No gender question.
3. **Quick start**: on the first join the phone shows name + 6 ready-made characters + **Random** + **Customize** + **Join game**. Nobody has to open the editor to play.
4. **Outfits per game are automatic**: face, hair, colours and accessories are the same everywhere; each game dresses the character in its own outfit tinted with the player's colour (Minigolf: polo shirt; Badminton: beach look — tank top, shorts, barefoot; see BADMINTON_BEACH.md step 2).
5. **No unlocks for now**: everything is available from the start. (Later maybe rewards like a winner's crown.)
6. **One character per phone**, saved on the phone (localStorage). Several characters per phone: later.

## Options (minimum set; same names as the canvas)
- Skin: the 6 existing `SKIN_TONES`.
- Eyes: Round, Sparkly, Happy (^ ^), Sleepy, Wink.
- Mouth: Smile, Grin, Oh!, Cat.
- Cheeks: Blush, None.
- Hair style: Short, Spiky, Bob, Ponytail, Curly, Bun. Hair colour: dark brown, brown, auburn, blonde, ginger, blue, pink.
- Your colour: the 6 existing `SHIRT_COLOURS` (also used for UI accents, outfits, hats).
- Hat: None, Cap, Visor, Beanie (in the player's colour). Glasses: None, Round, Sunglasses.
- Gear: racket grip colour and putter colour (the 6 colours), handedness Right/Left (already exists — move it here, keep how it works).
- Chibi proportions as approved: big head, short body, arms coming out of the shoulders at a slight outward angle with round mitten hands, sturdy legs with chunky shoes.

## Data and sync
- One versioned profile object in `shared/` (e.g. `AvatarProfile { v: 1, name, skin, eyes, mouth, blush, hairStyle, hairColour, colour, hat, glasses, gripColour, putterColour, handedness }`) with ids, not free text; the server validates every field against the allowed lists and falls back to defaults.
- Backward compatible: an old phone profile with only shirt colour + skin tone still works (missing fields get defaults).
- Phone stores it in localStorage and sends it on join; edits are sent live (throttled, ~10 per second max) so the TV preview follows; "Save & play" confirms.
- Two players may pick the same colour; if that happens in one match, the TV adds a small coloured name tag/outline so they stay distinguishable (ask the user before inventing anything bigger).

## Phone UI
- Screens as on the canvas: Quick start → (Customize → Editor) → Saved/lobby screen ("Looking good, <name>!", "You just hopped onto the cube on the TV", outfit-per-game preview, "Edit character").
- Live 3D preview of the character on the phone (small Three.js scene, cheap: low pixel ratio, render only on change + idle bob). If it costs too much battery or loads slowly, propose a fallback.
- Random: random everything, glasses only sometimes (~30 %).
- Touch targets ≥ 44 px, works one-handed, readable in sunlight, left-handed layout mirrors where it matters.

## TV side
- New player: the character pops onto the cube with a little jump; while they edit, changes appear live with a soft sparkle; a wave when they press Save & play.
- All existing animations (minigolf, badminton swings, dives, celebrations) keep working with every combination of hair/hat/glasses (no clipping through the racket arm or the camera).

## Steps
1. Data model + server validation + character.ts building all options (test page on the Mac that shows every option).
2. Phone editor with live TV sync (the 4 tabs, Random, Save & play).
3. Quick start with the 6 presets (Sunny, Skater, Bookworm, Sporty, Captain, Dreamer — as on the canvas) and the Saved screen.
4. Outfits per game (Minigolf polo, Badminton beach look) + same-colour name tags.
Keep minigolf, badminton, the hub and the Swing Lab working. Don't touch `host/hub/` internals while a cloud session works on it — only the hook that shows players' characters.
