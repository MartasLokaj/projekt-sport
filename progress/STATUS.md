# Project status — read this first in a new chat

Last updated: 2026-10-30. Read `CLAUDE.md` and `SPEC.md` too (SPEC is the source of truth; this file is the
running log of where we are, what the user decided, and what comes next).

## Where we are

| Phase (SPEC §10) | State |
|---|---|
| 0 Setup | Done, approved |
| 1 Phone ↔ host connection (1a lobby/QR/reconnect, 1b aim + swing) | Done, approved on real phones |
| 2 Graybox gameplay (A one hole + physics, B 1–4 players, turns, scores) | Done, approved ("Hra ve dvou funguje") |
| 2b Handedness + per-player sensitivity | Done, approved |
| 3 Chibi characters | Done, approved |
| 4 Art and juice | **In progress** — see below |
| 5 Character editor on the phone | Not started |
| 6 Polish | Not started |

### Phase 4 in detail
- **4a** Three holes + 3-hole games with per-hole/total scoreboard — done (holes later rebuilt, see 4b).
- **4b Look** — redone twice on the user's request. Current direction (user's words, from a reference photo of a
  real outdoor minigolf): each hole on its own **island in a cute sea**, other holes visible across the water,
  **rounded lanes with no corners**, **bright light-green turf**, **round dark-green fuzzy turf bumpers**,
  visible sun, puffy clouds, more waves, course blending naturally into the island.
  - **Step 1 — done** (commit `d833ac2`): curve-based rounded lanes + turf bumpers (look and physics from the same
    mesh), bright turf, matte grass, grassy islands with soft sand beach, island ground follows the lane (hole 2 is a
    grassy hill), bigger/faster waves, sky with sun, puffy clouds.
  - **Step 1b — done** (commit `b385609`): on the user's request (photo with red marks) the bumpers' outer side is a
    wide soft slope sinking into the island ground (`bumperSlope`, `bumperSlopeDepth` in `TUNING.course`); the island
    ground near the lane now sits at lane height − `groundDepth`.
  - **Step 2 — next:** dense, natural-looking vegetation on the islands ("so you can't tell the trees are made in
    code"), island grass + "other things". The user allowed downloading more CC0 assets, **but always state file
    name, source and exact size and get a yes before downloading**.
    - Checked Poly Haven (CC0): realistic trees are far too heavy (island_tree_02 46 MB / 1.7 M tris, jacaranda 215 MB,
      tree_small_02 101 MB) — not usable on a MacBook Air. Light enough: `shrub_02` 2.0 MB, `shrub_03` 1.6 MB,
      `shrub_04` 1.9 MB, `fern_02` 1.1 MB, `grass_bermuda_01` 1.5 MB, `flower_gazania` 2.8 MB (gltf 1k totals,
      via `https://api.polyhaven.com/files/<id>`).
    - **Done (waiting for the user's look test):** user chose **KayKit Forest Nature Pack** (Kay Lousberg, CC0, free
      tier). 24 models copied to `host/assets/forest/` (500 KB, licence included, credited in README).
      `host/game/vegetation.ts` plants groves of trees (bigger further from the lane), bushes at tree feet and along
      the bumpers, grass tufts everywhere; one InstancedMesh per model. Keeps clear of the lane and the camera's view
      behind the tee. Counts/sizes/tint in `TUNING.vegetation`. CPU ~1.25 ms/frame in the dev browser.
    - Then (user: "grass everywhere, trees better spread"): grass tufts on a jittered grid over all island grass
      (`grassSpacing`, mostly small tufts), groves spread evenly around each island (one per slice) + a few lone trees.
      ~430k instanced triangles in total — if the MacBook Air stutters, raise `grassSpacing` first.
    - Possible follow-ups: a tree may still block the camera mid-lane at bends (could fade like the windmill).
    - **Wind** (swaying trees/grass) — the user wants it in 4c.
    - Still need a **light CC0 tree source** (e.g. Quaternius stylized nature packs, or another CC0 set). Propose
      options with sizes to the user. Use instancing; keep 60 fps.
- **4c Juice — not started:** hole intro fly-over with "Hole N · Par P", confetti on hole-in (+ special hole-in-one
  celebration), ball trail, impact particles, small camera nudge on hit, sounds (Kenney CC0 audio — ask before
  download), phone vibration on hole-in (host → server → phone `vibrate` message), podium with winner celebration,
  playful open-licence font stored locally (e.g. Fredoka, OFL — ask before download).
- **Done when (SPEC):** looks good enough to show friends and runs at 60 fps on the MacBook Air (**fps on the real
  MacBook Air not verified yet**; in the dev browser a frame takes < 1–3 ms of CPU).

## How the user likes to work
- Talk in **Czech, plain words**, explain technical terms in one sentence. All code/comments/commits/in-game text in English.
- Plan first for bigger changes, list files, wait for OK. Phase by phase; the user tests on real phones before approval.
- After every change: exact test steps (what to open on the Mac, what to do on the phone, what they should see).
- Commit after each working milestone (attribution line from the system prompt).
- The user sometimes clicks quick "it works" buttons without testing → phrase approval buttons around what they saw.
- The user gives visual direction with reference images and short Czech notes; follow their taste closely.

## Decisions the user made (don't undo without asking)
- **Swing:** tap the button (not hold) → phone waits until still → locks start point → stroke fires when the phone
  swings back through the start point. Power = backswing length + speed (`controller/swing.ts`). Wrist-only flicks are
  rejected via accelerometer arc radius. A twisted phone at impact curves the ball. Very fine control for tiny putts.
- **Aim:** each shot starts straight ahead in the **camera direction** (NOT at the cup — the user disliked that).
  The phone's aim resets to 0 at each turn.
- **Aim line:** a white line on the ground (follows slopes); its length shows roughly how far the ball would roll
  (flat-ground estimate), live during the swing and after a practice swing. No path preview through walls.
- **Gauge:** vertical bar on the left with 3 marks; yellow knob climbs live with the backswing.
- **Practice swing** button on the phone (same tap flow, ball doesn't move).
- A slow ball very close to the cup rolls in (`tapInRadius`).
- The windmill fades see-through when it hides the ball or the aim.
- Room code can be typed on the phone (no need to scan the QR every time).

## Architecture (short)
- `npm run dev` → `server/index.ts`: HTTPS (self-signed cert in `certs/`), Vite middleware, WebSocket hub on port 8443.
  Server code changes need a restart (new room code each time). Page code hot-reloads.
- `server/lobby.ts` seats/room/routing, `server/match.ts` turns/strokes/scores over `HOLE_COUNT` (3) holes.
- `shared/protocol.ts` messages, `shared/tuning.ts` **all tuning values** (swing, ball, course, scenery, camera…).
- Host: `host/main.ts` (lobby UI, scoreboard, routing), `host/game/Game.ts` (rules, camera, aim line, gauge, turns,
  characters), `course.ts` (curve lanes, bumpers, cup pit, windmill, holes `HOLES`), `scenery.ts` (sky, sun, clouds,
  sea shader, islands), `character.ts` (chibi + procedural animations), `ball.ts`, `preview.ts`.
- Phone: `controller/main.ts` (join/room/turn overlay), `controller/play.ts` (aim, swing UI, slingshot fallback),
  `controller/swing.ts` (swing detection).
- Assets (all CC0): `host/assets/minigolf/` Kenney Minigolf Kit (only windmill + flag used now),
  `host/assets/textures/grass_*` ambientCG Grass004. Credits in `README.md`.

## Testing tricks (for Claude)
- The built-in browser can't accept the self-signed HTTPS cert. Run a plain Vite server instead
  (`npx vite --port 5199 --strictPort`, in the background) and open `http://localhost:5199/host/` or `/controller/?room=X`.
- Replace `window.WebSocket` with a fake class in the page (the page's reconnect then uses it), feed `host_info`,
  `lobby_state`, `game_state`; import the real server logic in the browser with `await import('/server/match.ts')`.
- In dev mode `window.game` is the Game. For reliable tests stop the loop (`game.renderer.setAnimationLoop(null)`,
  `game.clock.getDelta = () => 1/60`) and call `game.frame()` yourself; yield (`await new Promise(r=>setTimeout(r,0))`)
  so async state updates land. The pane may be hidden → screenshots can lag one render; render again before shooting.
- Node-side tests of physics/swing: `npx tsx` scripts in the scratchpad (import Rapier from
  `node_modules/@dimforge/rapier3d-compat/dist/rapier.mjs`).
- Real server tests: `PORT=8444 npx tsx server/index.ts` + a Node `ws` client (`rejectUnauthorized: false`).

## Known open points
- Verify 60 fps on the MacBook Air; quality knobs are in `TUNING.scenery` (`maxPixelRatio`, bloom, `seaDetail`).
- On real phones, maybe tune: `curveSign` (curve direction), `minArmRadius` (wrist check), swing power curve.
- The camera aims from behind the ball, so the character's backswing is less visible (offered a side camera; not decided).
- The windmill still shows its Kenney tile's low orange side walls under the rounded lane.
- Turf brightness/tint can still be tuned (`turfTint`, `bumperTint`, `islandGrassTint`).

## Next action
Get the user's feedback on the trees (density, size, colour) and tune `TUNING.vegetation`. Then 4c (juice, incl.
**wind**: trees and grass swaying), then ask the user to approve Phase 4.
