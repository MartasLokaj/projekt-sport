# Skiing (SPEC §15) — brief for Claude Code

Read this whole file, SPEC.md (§12 hub, §15) and progress/STATUS.md before starting. Talk to the user in Czech,
in plain words; all code and in-game text in English. Plan first, wait for the user's OK, build phase by phase,
test on real phones after each phase, commit, push and update progress/STATUS.md and progress/OVERVIEW.md.

## Why
The user (2026-11-10) saw a trailer of a chaotic multiplayer ski racing game and loved its look and the feeling of
speed on snow. They want a **downhill ski race** in our collection: **hold the phone sideways like a steering wheel,
tilt left to go left, tilt right to go right.** Inspiration only: no names, characters, logos or assets from that
game, and nothing in our game refers to it. The user may attach the reference screenshots to the first message.

## Look (from the user's reference screenshots)
Stylised, soft, "toy-like" 3D, same family as our minigolf islands and beach. What makes it work:
1. **Warm sun vs cool shadows.** Sunlit snow is creamy white, sunlit rock warm orange/ochre; everything in shadow is a
   saturated cool blue. Strong low sun, long soft shadows across the slope. This contrast is ~80 % of the look.
2. **Simple chunky shapes.** Faceted low-poly rocks and cliffs (flat shading), snow caps on top; fir trees made of a few
   stacked cone layers with snow on each layer; jagged mountains far away as a backdrop; light blue sky.
3. **Atmosphere.** Haze/fog towards the distance, glittering sparkles floating in the air, sun glare/bloom when the
   camera faces the sun.
4. **Speed.** Low chase camera close behind the skier, speed lines on the snow, slight blur at the screen edges at top
   speed, snow spray from the skis, two ski tracks left behind.

**No modelling needed:** build it in code like the rest of the game: rocks = icosahedrons with jittered vertices +
flat shading, trees = stacked cones (instanced), slope = procedurally generated terrain, mountains = a ring of jagged
low-poly shapes. Our chibi characters get a **ski outfit** (jacket + trousers in the player's colour, helmet or beanie,
goggles, skis, poles) the same way games already dress characters (AVATAR.md, outfits per game). Free CC0 packs only if
code shapes are not enough, and **always state file name, source and exact size and get the user's yes before
downloading anything.**

## Controls (phone)
- Phone held **landscape with both hands like a steering wheel.** Steering = roll (tilt left/right). Read
  `deviceorientation` / gravity from `devicemotion` (reuse the permission flow and sensor helpers we already have).
- **Calibration:** "Hold the phone like a wheel and press Ready" sets the neutral angle. Re-centre button on screen.
- **Dead zone** in the middle, **smoothing**, a **response curve** (small tilt = gentle carve, big tilt = hard turn)
  and the **per-player sensitivity** we already have. Handle both landscape orientations (phone turned either way).
- Send steering ~30× per second (throttled, latest value wins); the host interpolates.
- Big on-screen buttons (thumbs): **Jump** (hold to crouch, release to pop) and maybe **Tuck** (hold = faster, wider
  turns). Tilting the phone towards you could be tuck instead; decide after testing.
- Phone vibrates on hard carves, landings, crashes. Keep the screen awake.
- Mac keys for testing (← → steer, Space jump, ↓ tuck), like the other games.

## Race
- Downhill run from start gate to finish, ~60–90 s for a Quick race. Gates/checkpoints, rocks and trees to dodge,
  bumps and jumps, maybe boost pads (blue glowing snow).
- **One shared camera** that follows the whole group (not split screen: four views would be too heavy for the MacBook
  Air). Racers who fall too far behind the camera get a short "catch up" boost or respawn near the pack (party
  rubber-banding), so nobody is out of the game for long.
- 1 phone = vs CPU racers, 2–4 phones = everyone races (CPU fills to 4). Crashes = quick tumble in a snow puff, back up
  in ~1.5 s. Results on our existing podium.
- Later ideas (not now): items/pranks, wildlife, several slopes, night run.

## Snow effects ("juice", phase S4)
- **Ski tracks:** a ribbon behind each ski, slightly darker blue than the snow, fading out. (Later maybe real grooves via
  a render-to-texture snow height map, only if 60 fps holds.)
- **Snow spray:** small white particles from the skis, much more when carving hard or braking, so the player feels the
  tilt. Puff on landing and crashing.
- **Speed:** speed lines, camera pulls back and shakes slightly at top speed, light edge blur (cheap version only).
- **Air:** floating sparkles, sun glare. Keep particle counts in `TUNING.ski` and lower them automatically with 4 racers.

## Performance
Target **60 fps on the user's MacBook Air (Apple Silicon)**. Instanced trees/rocks, terrain in chunks that are
created ahead and dropped behind, cheap fog, one shadow-casting sun with a tight shadow camera following the pack.
Measure in the browser and report frame times to the user after each phase.

## Architecture
- New game in the registry (`host/hub/faces.ts`): it takes one of the mystery sides of the cube. Code in `host/ski/`,
  tuning `TUNING.ski` in `shared/tuning.ts`, phone screen in `controller/ski/`, new messages in `shared/protocol.ts`
  (e.g. `ski_mode`, `ski_steer {roll, jump, tuck}`), server mode flag like `curling_mode`.
- Reuse lobby, seats, phone connection, characters, outfits, sensitivity, podium, sounds, transitions.
- Do not change Minigolf, Badminton or Curling behaviour; touch shared files only where the registry/protocol needs it.
- Log steering samples for tuning to `logs/ski-steer.jsonl` (gitignored), like the badminton swing logs.

## Phases (each ends with the user's test on real phones and their OK)
- **S1 Tilt steering prototype (highest risk, first).** Graybox: a plain white slope, a few grey boxes as obstacles,
  one chibi on skis going downhill at constant speed, steered by the phone held like a wheel. Calibration, dead zone,
  smoothing, response curve, sensitivity, both orientations, a small on-screen debug readout of the roll angle on the
  big screen. Done when the user says steering feels natural and precise.
- **S2 Race.** Generated slope with gates, rocks, trees, bumps/jumps, speed physics (downhill acceleration, carving
  slows you), crashes, Jump/Tuck, 2–4 phones + CPU racers, shared pack camera, catch-up rule, finish + podium.
- **S3 Look.** The style above: warm/cool lighting, faceted rocks and cliffs, snowy firs, mountain backdrop, haze,
  ski outfits. Show the user 2–3 quick screenshots of lighting options before finishing.
- **S4 Juice.** Ski tracks, spray, speed lines, sparkles, glare, camera shake, vibration, sounds (CC0), music.
- **S5 Cube side.** A snowy little diorama on the cube (tiny slope, firs, a skier carving down endlessly), lobby card,
  match length choice (Quick/Normal/Long run).
