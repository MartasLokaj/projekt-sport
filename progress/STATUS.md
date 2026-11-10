# Project status — read this first in a new chat

Last updated: 2026-11-10. Read `CLAUDE.md` and `SPEC.md` too (SPEC is the source of truth; this file is the
running log of where we are, what the user decided, and what comes next).
Short overview for the user (in Czech: % done, what is missing, optimisation ideas): `progress/OVERVIEW.md` — keep it
up to date too.

## Where we are

| Phase (SPEC §10) | State |
|---|---|
| 0 Setup | Done, approved |
| 1 Phone ↔ host connection (1a lobby/QR/reconnect, 1b aim + swing) | Done, approved on real phones |
| 2 Graybox gameplay (A one hole + physics, B 1–4 players, turns, scores) | Done, approved ("Hra ve dvou funguje") |
| 2b Handedness + per-player sensitivity | Done, approved |
| 3 Chibi characters | Done, approved |
| 4 Art and juice | **In progress** — see below |
| 5 Character editor on the phone (AVATAR.md) | **In progress** — step 1 approved (`/avatars` OK), step 2 built, waiting for the user's phone test |
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
    - **Done, approved by the user ("Stromy vypadají skvěle"):** user chose **KayKit Forest Nature Pack** (Kay Lousberg, CC0, free
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
- **4b redo 3 (user, 2026-10-31, reference: a mobile minigolf screenshot) — done, waiting for the user's test:**
  user chose **wooden borders** (replacing the round turf bumpers) and to **keep the rounded lanes**.
  - **G1** lane turf = two-green **checker** pattern following the lane (shader, `laneCoord` = distance along /
    -1..1 across; `turfLight`, `turfDark`, `checkerLength`, `checkerColumns`), **wooden border** (bevelled plank,
    lighter top, painted grain/knots/joints; `bumperWidth/Height/Depth`, `woodBevel`, `woodColour`,
    `woodPlankLength`), **white cup rim** (`cupRimWidth`). Ball bounce checked (stays in, same restitution).
  - **G2** lanes **20 % wider** (`laneWidthScale` 1.2), **camera closer/lower** (aim 2.7/1.3, follow 3.0/2.0).
  - **G3** islands: brighter grass with **meadow patches** (`meadowPatchSize`, `meadowDark`, `meadowLight`),
    soft **hills** away from the lane (`hillsPerIsland`, `hillSize`, `hillHeight`, `hillClearance`), groups of
    grey low-poly **boulders** (`boulderGroups`, `boulderSize`, `boulderClearance`). All in `TUNING.course` /
    `TUNING.scenery`.
- **More holes (user, 2026-10-31): 6 new holes (4–9), same look, "pipes, ramps, jumps". Agreed plan:** the whole Kenney
  Minigolf Kit is already in `host/assets/minigolf/` (nothing to download); the new pieces are built in code in our
  style. Steps: **J1** lane pieces (gap/jump, pipe) + holes 4 (Pipe) and 5 (Ski jump); **J2** holes 6 (Castle, Kenney
  castle with a narrow gate + a safe detour) and 7 (Banked U-turn, then downhill); **J3** holes 8 (narrow Bridge on
  posts to a small island) and 9 (Finale: ramp, pipe, jump, funnel round the cup). Always play all holes for now
  (a 3/9 choice in the lobby maybe later — needs a server change).
  - **J1 — done; user (after the server restart and the windmill hitbox fix): "už to funguje dobře".** Path point flags in `course.ts`: `ramp` (straight-line height change,
    so a ramp's top edge launches the ball), `gap` (no floor; wooden boards under both edges; the island dips into a
    pond there — `pondWidth/pondSlope/pondDepth/pondSpread` in `TUNING.scenery`; falling in = "Splash! +1"), `tube`
    (blue pipe resting on the borders, solid inside, fades like the windmill; `tube*` in `TUNING.course`).
    The island's flat top now follows the lane's lowest point (so a tee can sit on a hill). Sea shader knows up to 12
    islands; no foam inside ponds. On slopes the grass brakes less (`slopeFrom/slopeFull/slopeResistance` in
    `TUNING.ball`), so a ball that stops on a ramp rolls back (this also affects the hill on hole 2, slightly).
    Hole 4: tee on a hill, the ball dives down the pipe onto the green (any shot over ~20 % gets through; power
    decides how far it shoots out). Hole 5: ramp + 1 unit gap, needs ~65 % power; weaker = splash. `HOLE_COUNT` = 5
    for now. Testing shortcut: host page `?hole=N` starts at hole N (server: `start_game.firstHole`).
  - **J1 approved by the user ("vše funguje skvěle").**
  - **J2 — done, waiting for the user's test.** Hole 6 (Castle): a slope up to the Kenney `structure-gate-building`
    standing across the lane (scaled to span it, `castleOverhang`; HoleDef `castle`), the ball must go through the
    arch (~0.6 wide for the ball's centre); a miss bounces off the wall and rolls back down the slope; through the
    arch it is downhill to the cup. (The "safe detour" from the plan was dropped: the lane would need a fork.)
    Hole 7 (Banked U-turn): path point `bank` (degrees, eases like the height) tilts the floor and borders; the U-turn
    winds downhill, fast balls ride up the outer wall, then a slope down to the cup. To make balls roll out of the
    curve, the grass now holds less from 2° to 5° of slope (`slopeFrom/slopeFull` were 3/8). `HOLE_COUNT` = 7.
  - **J2 approved by the user ("pecka").**
  - **J3 — done, waiting for the user's test.** Hole 8 (Bridge): path flag `bridge` = narrow plank bridge on posts
    with no borders (`buildBridge`, `bridge*` in `TUNING.course`); the water cuts right across the island under it
    (`bridgeShore`); falling off = "Splash! +1" (`lane.overWater`). Straight shots cross, ~5° off falls in.
    Hole 9 (Finale, par 3): ramp + jump (~75 % power), landing, pipe down, and a **funnel** round the cup (HoleDef
    `funnel` {radius, depth}: the green sinks into a bowl, the cup at its bottom) — a straight 90–100 % shot can be a
    hole in one. (The first idea, pipe first and then the jump, did not work: the ball loses too much speed in the
    pipe's bends.) `HOLE_COUNT` = 9; scoreboard columns a little narrower so 9 holes fit.
- **4c Juice — not started:** hole intro fly-over with "Hole N · Par P", confetti on hole-in (+ special hole-in-one
  celebration), ball trail, impact particles, small camera nudge on hit, sounds (Kenney CC0 audio — ask before
  download), phone vibration on hole-in (host → server → phone `vibrate` message), podium with winner celebration,
  playful open-licence font stored locally (e.g. Fredoka, OFL — ask before download).
- **Done when (SPEC):** looks good enough to show friends and runs at 60 fps on the MacBook Air (**fps on the real
  MacBook Air not verified yet**; in the dev browser a frame takes < 1–3 ms of CPU).

### Minigolf fixes after a real phone game (2026-11-03) — done, waiting for the user's phone test
User reported three problems; fixed in three commits:
1. **Swing fired with no/tiny motion** (`controller/swing.ts`): hand shake (startAngle 2°, reverseSpeed 15°/s,
   3° backswing was enough) and gyroscope drift counted as strokes. Now a stroke needs `minHitBackswing` 8° and
   `minHitSpeed` 40°/s at the start point; the start point re-locks while the phone is held still (`driftRate`);
   `startAngle` 5°, `reverseSpeed` 30°/s. Power curve unchanged (`minBackswing` 3 is still the power deadzone).
   A too-small swing shows "Too small…" and waits for a real one. Simulated: tremor/micro/slow wander → no hit,
   10° gentle putt → ~3 %. If real gentle putts get ignored, lower `minHitBackswing` / `minHitSpeed`.
2. **Waiting players in the view** (`Game.updateCharacters`): they now stand beside the ball at ball level on the
   side away from the golfer (`spectatorSide` 1.5, `spectatorBehind`, `spectatorSideStep`), line up by the aim
   (follow it after > `spectatorFollowAim` 25°) and step out if within `spectatorClearance` of the camera→ball→aim
   line. (Over water on the bridge hole they may still float beside the bridge, as before.)
3. **Trees blocking the view** (`vegetation.ts` `Planter.fadeBlocking`, called from `Game.updateOccluders`): trees and
   bushes between the camera and the ball / aim line middle / aim end dissolve into a fine dot pattern (shader
   discard, per-instance `instanceFade` attribute; grass never fades) and come back. `TUNING.vegetation.fadeAmount/
   fadeReach/fadeSpeed`. Boulders do not fade (they are kept away from the lane).

### Cube World hub (SPEC §12) — started 2026-10-30, before 4c
- The user added SPEC §12: the lobby becomes a floating rounded cube, one small world per face (Minigolf playable,
  Badminton teaser, other faces "under construction"), players' chibis on the cube, game registry architecture.
- **Step 1 — visual concepts (done; the user picked B · Starry space):** throwaway prototype (deleted after 2a, in git
  history at commit `7b8bf53`, `host/concepts/`):
  - **A · Dreamy sky — grassy block:** blue sky, puffy clouds, sandy cube with grass caps on every face.
  - **B · Starry space — toy planet:** dark purple space, stars, distant planets, lavender cube with a cyan glow halo.
  - **C · Sunset above the clouds:** purple-orange sunset, a sea of clouds below, cream cube.
  Each shows the Minigolf face (sea, 3 islands, windmill, flags, KayKit trees), the Badminton face (court, net,
  blue tarp with shuttlecock, "Badminton coming soon"), construction faces (cones, crates, scaffolding, glowing "?",
  fog puffs), 3 waving chibis on top, room/QR panel and a "Minigolf · Play" panel.
- **User's choice (2026-10-30): B · Starry space — toy planet.**
- **Build plan (user said OK 2026-10-30):**
  - 2a Host hub: real 3D space cube replaces the HTML lobby (`host/hub/`), QR/room panel kept, players pop in as
    waving chibis with name tags, arrows rotate the cube, Enter on Minigolf starts, locked faces say "Coming soon",
    return to the cube after a match with Minigolf in front.
    **2a done (waiting for the user's test):** `host/hub/Hub.ts` (scene, turning, characters, HTML name tags,
    `turn()`, `show(id)`, `setPlayers()`, `showHit()`, `start()/stop()`), `host/hub/faces.ts` (`FACES` list — a
    temporary registry until 2b — and the face dioramas + top meadow), lobby layout in `host/index.html`
    (QR card top-left, game card on the right with ‹ Play ›, "Cube World" title at the bottom), wiring in
    `host/main.ts` (arrows/Enter/click; the old per-phone aim/power readout cards are gone — a swing in the lobby
    makes that character jump and shows the power in its name tag). Tuning: `TUNING.hub`. CPU ~1.6 ms/frame.
    **2a redo (user: "pecka", then asked for):** cube centred and bigger; **drag with the mouse to spin it freely**
    (keeps spinning a little, then drifts slowly by itself); **click a side** (or ← →) to choose a game: that side
    turns **up** (tipped towards us), the game card slides in on the right and the players' chibis **pop up on that
    side** one after another. Click into space / drag / Esc lets go (card slides away, characters vanish). The cube now
    has 6 sides (`FACES` in `faces.ts` with `normal` + `forward`): Minigolf, Badminton, 4 mystery building sites.
    **Zoom:** mouse wheel or trackpad pinch (`zoomMin`/`zoomMax`/`zoomSpeed` in `TUNING.hub`).
    Who has joined is listed under the QR code. Enter with nothing chosen picks Minigolf, Enter again plays.
  - 2b Game registry (`shared/games.ts` + host side), server remembers the selected game (`select_game`), phones
    show it; leader swipes left/right and taps Play.
  - 2c Juice: dive-into-the-face transition, sparkles, pop-in, 60 fps check.
- **Then:** the real hub: game registry, cube scene in `host/`, face
  rotation with arrows/Enter/click and phone swipe, dive transition into the game, "Back to Cube". Plan first, list
  files, wait for OK.

### Cube World 2.0 redesign — started 2026-10-31 on the user's request
- The user pasted a big "Cube World 2.0" brief (premium Wii-Sports-level platform: menu, lobby, phones, games,
  sound, intro/results). Agreed plan (user: "ano, začni s K1 a pokračuj podle plánu"; font = my choice; sounds
  will be downloaded later from somewhere — ask with file names/sizes first):
  - **K1 lobby UI — done (commit "Cube World 2.0 K1"), waiting for the user's test.** Design system
    `host/ui/theme.css` (colour/type/spacing/radius/shadow/motion tokens, panels, buttons, chips, keycaps, toasts,
    avatars), font **Nunito Sans** (OFL, `host/assets/fonts/`, 93 KB, credited in README), lobby styles
    `host/ui/lobby.css`, logic `host/hub/lobbyUi.ts`. Join panel: QR on white, room code boxes, 4 seats
    (avatar in shirt/skin colours, Connected / Joining / Away, ★ Leader = first connected player = the server's
    leader, P1–P4), folded "Phone can't connect?". Game card: artwork (own SVG icons), status chip
    (Ready / Prototype / Coming soon), players, controls, modes (the one matching the joined phones is lit),
    Play button with Enter keycap, note line, ‹ dots ›. Toasts: joined / lost connection / is back / left.
    Registry fields in `faces.ts`: status, accent, icon, min/maxPlayers, controls, modes. Layouts for small
    laptops, tablets (join bar on top, card as bottom sheet) and upright phones. Tuning `TUNING.lobbyUi`,
    `TUNING.hub.fitAspect/portraitLift`. Badminton is shown as a playable **prototype** (no longer "coming soon").
  - **K2 living cube — done, waiting for the user's test.** Each side has `userData.tick`: minigolf sea waves,
    trees sway, windmill turns, a ball putts into a cup every few seconds; badminton: an endless rally of a glowing
    shuttle over the net (the tarp is gone); building sites: the "?" floats, fog drifts. Chosen side: glowing
    frame in the game's colour, halo turns that colour, a small pop. Space: 3 twinkling star layers that turn with
    the cube at different depths, faint nebula clouds, glowing dust. Touch: drag + two-finger pinch zoom.
    Clear-coat cube material. Tuning in `TUNING.hub` (starParallax, dust, nebulaOpacity, frameOpacity, choosePop).
  - **User feedback on K1/K2 (2026-10-31): "je to dobré, ale…" — done:**
    - **Title menu** first: the cube spins behind frosted glass (`TUNING.hub.titleSpin`), big "Cube World", two
      buttons **Play** (Enter) and **How to Play** (4 steps: choose a game first, then join with phones via QR /
      address + room code on the same Wi-Fi, make your player, play; plus the security-warning tip). Esc on the
      cube with no game chosen goes back to the title. After a match the title is skipped.
    - **The join panel (QR, room code) only slides in once a playable game is chosen** (not for "coming soon").
    - **Players are shown only as characters standing on the cube** — the player list and the join/leave toasts
      are gone (a disconnected player's name tag still says "(away)").
  - **Hub design pass 2 (user, 2026-10-31; plan shown, then built in 6 commits):**
    1. Fixes: join address on its own line (no "typ e" break); the camera-facing "Badminton prototype" sprite
       that poked out past the edge is gone; building-site fog balls → sandy dust wisps that rise and fade.
    2. Chosen side: soft glow + frame in the game colour, a 3D wooden **name sign** springs up at its back
       (`host/hub/sign.ts`), other sides dim to `dimOthers`. Brand moved to the top-left.
    3. Spilling over the edges: minigolf **waterfall** off the front edge into space (shader ribbon + spray),
       trees on knolls leaning out over edges (`overhangLean`), **orbiters**: golf ball moon, shuttlecock, tiny
       cube (`TUNING.hub.orbiters`).
    4. Space: nebula + planets with their own parallax, ringed pink planet, striped giant, **shooting star**
       every 5–11 s, fresnel **light outline** round the cube in the game colour.
    5. Card: side **icons** instead of dots; joined players' **faces** (shirt/skin, faded when away) instead of
       "N players ready"; the **join panel shrinks** to a small QR when everyone who joined is connected (hover
       opens it; wide screens only).
    6. Motion: the cube **hops** when a game is chosen (`switchHop`); a **newly joined player jumps down** onto
       the chosen side and lands with a squash and **confetti** (`host/hub/confetti.ts`, `drop*`, `confetti*`).
    Waiting for the user's test on the Mac (60 fps not measured on the real MacBook Air yet).
  - **K3 sounds** (menu, turn, join, countdown; volume + mute) — next; needs downloaded sounds: propose CC0 files
    with names and sizes, ask first.
  - **K4 dive-in transition — built 2026-10-31 (user: "ponoření do strany kostky, top nápad"; only the dive, no
    players intro / 3-2-1 yet), waiting for the user's look.** Play → the lobby panels fade, the camera flies into the
    chosen side (`Hub.diveIn`, ease-in, ends `diveEndDistance` from the side's middle and stays there), a soft white
    flash (`host/ui/transition.ts` `Flash`, `#scene-flash` in `theme.css`) starts `flashInMs` before the dive ends,
    the game is swapped in behind it (minigolf waits for the course to load), then the game's camera glides down from
    high above/behind (`Game.swoopIn`, `Badminton.swoopIn`; badminton ignores swings and delays the computer's serve
    until it lands). Back to the cube: flash → `Hub.pullOut(id)` (user: "ugly zoomed in" → now starts only `pullOutFrom` 0.15 of the way to the side and settles to the normal view of the whole cube). Steps
    run in a queue in `host/main.ts` (`enterGame` / `leaveGame`), host keys wait meanwhile. The Swing Lab (L) opens
    without a dive. Tuning `TUNING.transition`. Checked in the dev browser (fake server): minigolf and badminton in
    and out, camera paths, no serve during the swoop, no console errors.
  - **K4 rest:** match intro (players + 3-2-1), results screen with Play again / Back to the cube,
    for minigolf and badminton. **K5** phone lobby screen (avatar, status, selected game, Ready — needs a server
    change, do last). Then the rest of the brief (game polish) phase by phase.

### Badminton (SPEC §13) — started 2026-10-30 on the user's request (hub 2a still untested on phones)
- User decisions: beach venue; all shots fly to the back for now, later a big phone button = "short shot".
- **B1 Swing Lab — built, waiting for the user's test on real phones.** `L` in the lobby (or Badminton side → Enter)
  opens it; phones switch to "Badminton swing test". The phone is held like a racket handle (top = racket head),
  no button: a turn faster than `triggerSpeed` is a swing, reported right after its fastest moment (~50 ms).
  Overhead = top of the phone above `overheadMinTilt` at the fastest moment (tilt from the fused orientation sensor,
  gravity as fallback; iPhone gravity sign is flipped). Power from peak speed. Phone↔server clock sync
  (`clock_ping`/`clock_pong`, fastest answer wins), so `at` is in server time. The big screen drops a shuttle to a hit
  line every `fallMs+pauseMs` and judges Early/Perfect/Late; cards show kind, band (soft/medium/hard → Clear/Smash/
  Lift), timing, delay, speed+tilt graph. Every swing → `logs/badminton-swings.jsonl` (gitignored) for tuning.
  - Not verified on real phones: tilt sign on iPhone/Android, whether `triggerSpeed`/`maxSpeed` fit, whether the
    follow-through/arm coming back makes double swings (`cooldownMs`), whether timing feels fair (`displayLatencyMs`).
  - **Test 1 (user, 28 swings, `logs/badminton-swings-session1.jsonl`):** "works quite well", but (a) reaching up
    with the racket counted as a swing and the real, faster swing right after was lost in the cooldown; (b) hard
    overheads were called underhand, because at the fastest moment the racket already points forward (tilt ~0).
    Real swings reach 1000–2100°/s; phone→Mac delay 50–200 ms.
    **Fixes:** `confirmMs` wait (a faster swing right after replaces the first), learned swing direction per phone
    (`learnSpeed`, `backwardDot`: a turn the other way = racket going back/up → `ignored`, still logged),
    overhead = highest tilt in `overheadLookbackMs` before the peak ≥ `overheadMinTilt` (45), `maxSpeed` 2000,
    hit line moved to the middle of the drill. Trace now also has the gyro x/y/z. Cost: report ~330 ms after the peak
    (hit time stays exact). Backhand swings would turn "the other way" and be ignored — fine for now, revisit in B2.
  - **Test 2 (60 swings, `logs/badminton-swings-session2.jsonl`):** user: "it does not tell underhand from overhead
    at all, but that's fine" → **decision: shot type from court position** (back = overhead, front = underhand unless
    a smash is possible; SPEC §13). Data: real swings 780–2100°/s (gyro tops out ~2000, many hard swings hit it),
    reaching/getting ready 380–730°/s; the learned-direction filter wrongly ignored ~7 fast real swings (probably the
    underhand ones turn the other way); confirm wait made every report ~360 ms late; timing spread vs. the drill
    ~±130 ms median (clock sync works).
    **Changes:** no overhead/underhand and no direction learning; `minHitSpeed` 750 (slower = ignored, still logged);
    swings ≥ `instantSpeed` 1100 are sent at once (~50 ms after the peak), softer ones wait `confirmMs`;
    power from 750..1800°/s.
  - **Test 3 (53 swings, `logs/badminton-swings-session3.jsonl`): approved ("pecka").** 30 hits, no doubles,
    23 reaches ignored (max 639°/s vs min hit 812°/s), delay ~80 ms median, 19/30 within ±150 ms. **B1 done.**
- **Aiming (user):** the swing direction aims (more left / more right); timing only decides hit/miss and quality.
  Measured as the share of the turn around the world's vertical axis near the peak (`aim` -1..1, `aimGain`,
  `aimDeadzone`, `aimSign` to swap if a phone reports it mirrored). Shown in the lab and on the phone.
  **Not verified on real phones yet** (sign on iPhone vs Android, whether left/right swings really differ).
- **B2 prototype — built, waiting for the user's test.** Badminton side of the cube → Enter "Play prototype"
  (L = Swing Lab). `host/badminton/`: `Badminton.ts` (rally rules, CPU, running, racket arm, camera, HUD),
  `shuttle.ts` (on-rails flight curve: fast start, slows, steep drop; `makeShot`, `findContact`), `court.ts`
  (graybox sand court, net, shuttle, racket — the only venue file). Tuning: `TUNING.badminton`.
  Rules: contact = where the shuttle descends through `overheadHeight` on the receiver's half (back → clear, or
  smash if power ≥ `smashPower`; front (< `frontZone`) → smash), else underhand lift at `underhandHeight`.
  Hit if |swing time − contact time| ≤ `hitWindowMs` (250); ≤ `perfectMs` (100) = Perfect (faster, no scatter).
  While waiting for the phone after the contact moment the shuttle creeps at `waitSlowdown`; miss after
  `hitWindowMs + lateGraceMs`. CPU: `cpu.hitChance` etc. Rally scoring to 11, winner serves (player serves by
  swinging). Plays the first connected phone; Mac Space = swing (← → aim). Character got `armPose`, `handArm` and a
  `putter: false` option. Tested in the dev browser with a scripted player (rallies, misses, scoring, Esc).
  - **User test 1: "good"**, but asked for (done): hit the shuttle early in the air like real badminton (research:
    real contact ~2.3 m clears / ~2.2 m smashes for adults) → `findContact` takes the first reachable point at
    `runSpeed` (fallback `maxRunSpeed`) below `reachHeight` 2.3; stroke from contact height (`overheadFrom` 1.7 →
    overhead/smash, `driveFrom` 1.0 → new flat `drive` shot, lower → lift); serve only diagonal into the service
    court; shuttle glowing red, `shuttleScale` 1.6. Scripted test: clears met at 2.25–2.3 m, smashes defended at
    0.85–1.15 m around 2–3 m from the net.
  - **User test 2:** wanted a jump smash at cartoon height ("like the big party sports games") and "I don't hit at
    all — Too early". Log (`logs/badminton-swings-game1.jsonl`, 60 swings) showed almost every aim read as right
    (natural forehand sweep). **Done:** `reachHeight` 3.0 with a jump above `standingReach` 1.8 (racket top
    standing), `jumpRiseMs`; asymmetric window `hitWindowEarlyMs` 350 / `hitWindowMs` 250; `aimGain` 1.0 and
    `aimAutoCenter` 0.15 (the phone learns the player's usual direction as straight).
  - **User test 3: "I hit well, this is top, keep it"** (jump smash, timing window, aim centring approved).
    Then asked: shuttle slower and predictable, no slowing down near the player. **Done:** flight times ×~1.4,
    drag lowered (steadier speed), `waitSlowdown` removed — a late-arriving swing starts the return from where the
    shuttle is by then. Later (B5): make shot speeds visually distinct.
  - **User test 4: "Rychlost je dobrá" — B2 approved (2026-10-30).**
- **B3 split screen 1v1 — built (user said "Ano, postav B3"), waiting for the user's test with two phones.**
  `Badminton.ts` now has a near and a far athlete, each human (a phone) or the computer. Two connected phones →
  split screen: first player = near side, left half; second = far side, right half; each half has its own camera
  behind its own player (`splitCameraFov`, `splitCameraBack`), white divider, per-half shot feedback, shared
  score with both names. One phone → vs CPU full screen as before. `host/main.ts` maps phones to sides
  (`badmintonIds`). Mac keys: Space = near player (← → aim), ↑ = far player. Left-handed far players mirrored.
  Scripted 2-player test in the dev browser: rallies, scoring, no errors, ~2.7 ms CPU per frame (two renders).
  - User: "now it's too slow again" → flight times set halfway between the B2 and the slow version
    (about 15 % faster: clear ~2.1 s, smash ~1.0 s).
  - User: "speed is super". Then (done): **to 4 points, win by 2** (`pointsToWin` 4, `winBy` 2, "Game point!" /
    "Deuce" messages); **court 25 % bigger** (`courtHalfWidth` 3.25, `courtHalfLength` 8.4, `shortServiceLine` 2.5,
    depths, home/serve positions, faster running `runSpeed` 6 / `maxRunSpeed` 10.5); **more movement**: ready bounce
    on the toes while the other side plays (`readyBounce`), computer aims across the whole court (`cpu.aimRange` 1);
    **smash only from the back** (`smashFromDepth` 4.6; the old "high at the front = smash" rule is gone).
    Scripted test: smashes only from 5.0–6.0 m, a match ended 4 : 2 with "Game point!".
  - User: "good, but I don't like that it jumps by itself — then it is too easy to know when to hit; bigger shuttle".
    **Done:** a player's character jumps only with the swing, to the shuttle's height at the swing moment
    (`swingJumpRiseMs` 180; the return starts at the top of the jump from wherever the shuttle is: `pendingHit`);
    stroke from the height at the swing (`strokeAt`); racket windup for players starts when the shuttle enters
    their half; the computer still jumps by itself; `shuttleScale` 2.4. Scripted: no jump before the swing,
    early swing → 1.2 m jump, late → 0.16 m hop, chest-height on time → no jump.
  - User: "okay, this is divine" — approved.
  - The user then added **`BADMINTON_MECHANICS.md`** (linked from SPEC §13): 9 mechanics to add before 2v2, in order
    (1 SHORT button, 2 wobble + dive/fall, 3 Super Smash, 4 feedback/movement/CPU levels, 5 rally escalation, trails,
    match options, 6 then B4 2v2). Each step: plan → OK → build → test on phones → commit, push, STATUS.
  - **Mechanics step 1 (SHORT button + short serve) — built, waiting for the user's phone test.** Phone: big
    SHORT button at the bottom (left for right-handers, right for left-handers), held = blue "SHORT ✓", light
    vibration on Android; `short` is sent with each swing (held at the peak or let go ≤ `shortGraceMs` before).
    Game: new shots `drop` (any height, lands 0.8–2.4 m past the net, crosses the net low: `dropNetClearance`) and
    `shortServe` (just past the short service line); a drop from the back is less precise (`shortShotScatterBack`,
    `shortShotNetChanceBack` → `Flight.intoNet`, point to the receiver); CPU plays drops (`cpu.dropChance`) and
    short serves (`cpu.shortServeChance`); nobody hits closer than `minContactDepth` to the net. Mac: Shift+Space.
    Lab card shows SHORT. Scripted test: drops land 1.1–1.9 m from the net, short serves at 3.2–3.4 m.
  - **User test: "works well"**, but the drop was too brutal: now it passes 40 cm over the net
    (`dropNetClearance` 0.4, drop apex 0.8; short serve keeps `shortServeNetClearance` 0.12). Still met at most
    ~1 m from the net, so it can never be smashed (smash needs `smashFromDepth` 4.6).
  - **Mechanics step 2 (wobble + dive/fall/recovery) — built (user: "Ano, postav krok 2"), waiting for the
    phone test.** Wobble (`wobble` shot: slower, higher, sways sideways, keeps `wobbleAimShare` of the aim, purple
    dot trail `Trail` in `effects.ts`) when: power < `wobblePower` (not drops), timing outside `goodEarlyMs`/
    `goodLateMs`, or a dive. Receiver sees "⚡ Smash chance!" in their half; the phone gets `badminton_cue`
    (host → server → phone; text + Android vibration). `findContact` now returns `reach` (run / dive within
    `diveReach` / none) and takes `availableAt` (after getting up). Swing far too early (> hitWindowEarly +
    `diveExtraMs`), too late, out of reach, or no swing → dive and miss; a little too early or dive-reach → dive and
    wobble. Dive = belly-flop along the dive direction + sand puff (`SandPuffs`), lying `recoveryMs` 900, can't
    move/hit. CPU follows the same rules and plays wobbles (`cpu.wobbleChance`). Mac: W+Space = weak swing.
    The old "Too early → swing again" is gone (now a dive).
  - **User test: "now I just keep falling into the sand"** → falls only when the swing is **really late**
    (> `veryLateMs` 400 after the right moment, also when its message arrives after the miss was called:
    `missedContact`), or (step 3) a badly timed Super Smash attempt. Far too early = "Too early!" and swing again
    (no fall); a little too early (`earlyWobbleMs`) or a stretch (`diveReach`) = wobble without falling; out of
    reach or no swing = miss without falling. The computer still falls when it misses.
  - **Mechanics step 3 (Super Smash) — built (user: "Odkudkoli, postav to": allowed from anywhere, the normal
    smash stays back-only), waiting for the phone test.** Strong (≥ `superSmashPower` 75) overhead swing on a
    `wobble`, shuttle ≥ `superSmashMinHeight` 2.4 m at the swing, timing in the Good part → `superSmash`
    (0.55–0.75 s, ×0.9 if Perfect); chain in one rally: ×`superSmashChainBoost` 1.12 each, cap
    `superSmashMaxSpeed` 1.8. Strong try badly timed → weak wobble back + fall ("Super Smash failed!"); outside the
    window → miss + fall. Returning one: `superSmashDefenseWindowMs` 180/130 (`hitWindow()`). Juice: hit-stop
    `superSmashHitStopMs` 300 (shuttle waits at the racket: `pendingHit.contactAt` vs `when`), white flash
    (`#badminton-flash`), big golden bouncy "SUPER SMASH! (×n)" in the hitter's half, gold trail, sand burst +
    camera shake on landing, hitter's phone cue `super_smash` (strong vibration on Android). CPU tries one on high
    wobbles (`cpu.superSmashChance` 0.5) and returns one with `cpu.superSmashReturnChance` 0.3.
    Scripted: perfect try → Super Smash 504 ms; third in a chain 402 ms; −250 ms → "failed" + fall.
  - **User test step 3: "plays well" — approved.**
  - **Mechanics step 4 — built (user: "Ano, postav krok 4"), waiting for the phone test.** Timing text pops up
    above the player's own character (`showPop`, `.badminton-pop` coloured perfect/good/wobble/miss, `popMs` 900,
    placed by projecting the head with that half's camera); Perfect → racket glows gold (`perfectGlowMs`) + phone
    cue `perfect` (short buzz); tips "wait for it!" / "swing sooner!" after early/late misses at most once per
    `hintEveryRallies` 3 (`tip`); running `reachAssist` 0.2 (in `findContact` and the run speed); computer levels
    `cpuLevels` easy/normal/pro (reaction, return chances, smash/drop/wobble/Super Smash chances, aim, power,
    quality), keys 1 2 3 in a match against it, "CPU: Normal" label next to the score. Scripted: Perfect → gold pop +
    glow + cue; tips every 3 rallies; Pro selectable.
  - User: "good, but I want the difficulty already where I pick Versus CPU or 1 v 1" → done: the Versus CPU mode row
    in the lobby card has Easy / Normal / Pro (`GameMode.levels`, `LobbyUi.cpuLevel`, keys 1 2 3 in the lobby too);
    `Badminton.start(near, far, level)` uses it (keys 1 2 3 still work during the match).
  - **Mechanics step 5 — built (user: "ano jdeme na to"), waiting for the test.** Rally hits counter (`hits`,
    serve counts) in the top-left of each half from `rallyThresholds.show` 3, orange from `birds` 5 (seagulls
    `Birds` in `effects.ts` circle the court), red "🔥" + fire trail on every shot (except wobble / Super Smash)
    from `fire` 10, "Rally ×N!" under the point message from `celebrate` 5. Trails by shot type (`trails`,
    `fireTrail`). Match length in the lobby card's Match row: Quick (to 4, win by 2) / Normal (to 11, win by 2,
    cap 15) / Long (to 21, win by 2, cap 30) (`matchLengths`, `FaceInfo.matchLengths`, mode detail "{length}",
    `Badminton.start(…, level, length)`); messages "Game point!", "Deuce: win by 2", "Next point wins!" (at the
    cap). Music / louder waves wait for sounds in B5 (none yet). Scripted: 11:9 wins, 15:14 wins by the cap.
  - User: "good, but I don't like the texts, don't write them at all, you can't see the game" → `screenTexts:
    false`: no timing pops, tips, "Smash chance!", "SUPER SMASH!" text, point messages, serve prompt, Mac keys line
    or CPU label during play. Only the score, the rally counter and the result at the end of a match show. Visual
    cues stay (gold racket glow, flash, trails, colours, phone texts). Set `screenTexts: true` to bring them back.
  - Next: user tests → B4 (2v2) — plan first.
  - **2026-10-31, user: "hits are good but not precise; make a system that studies the player and adapts speed,
    swing, ping…; the character must run more — after a short shot, when a lift comes, it must already be
    running there".** Agreed plan: step 1 footwork, step 2 a per-player "coach" (learns each player's timing
    offset, swing strength, aim spread and Wi-Fi delay; adapts after ~5 hits; outcome of each hit added to the
    swing log). User: "start with running, and make it do lunges like real badminton".
  - **Footwork step — approved by the user on phones ("Běhá a dělá výpady").** `TUNING.badminton.footwork`. After a shot the
    hitter goes straight to a base: deeper (`baseDepthVsNet` 6.2) when the other side meets the shuttle near the
    net (`frontContactDepth` 3.5) or low (a lift is coming), else `homeDepth`; shifted towards the other player's
    side (`baseFollowX`). Split-step hop as the other side hits (as long as the reaction time). Legs now have hip
    pivots (`Character.legPose`, shared with minigolf, null = straight): running strides, lean into the run
    (forward / back / sideways), little sand puffs at each fast step (`SandPuffs.burst(…, size)`). **Lunge**
    (`lunge*`): a shuttle taken below overhead height closer than `lungeDepth` 4.5 to the net, or a stretch → racket
    leg forward, body low, leaning towards the shuttle, held `lungeHoldMs` after the hit. Checked in the dev
    browser (CPU vs CPU, pictures from the side): drop hitters are back at 6.2 m before the reply, lunges at the net.
    Note: the app's browser pane can't open the self-signed https server; tested with a temporary http copy.
  - **Coach step — built, waiting for the user's phone test.** `host/badminton/coach.ts`, tuning
    `TUNING.badminton.coach`. Per player name (kept while the server runs), from the last `memory` 15 swings,
    after `minSwings` 5: right moment moved by `timingShare` 0.6 of the median early/late offset (max
    `maxTimingShift` 120 ms); power scaled so their strong swing (80th pct) gives `strongPower` 85 (×1..1.5);
    aim scaled so their wide swing gives `wideAim` 0.75 (×1..1.6); miss called later by the 90th-pct Wi-Fi delay
    over `normalDelayMs` 150 (max 250 ms) and by a positive timing shift. Real data: delay median ~50 ms but 1 in 10
    over ~300 ms; aim 80th pct only 0.5–0.6. Each judged swing → `logs/badminton-outcomes.jsonl` (host message
    `badminton_outcome`): raw offset, shift, raw/adapted power and aim, delay, verdict. Console:
    `badminton.coach.report()`. Scripted test (always 100 ms early): after 8 swings shift −53 ms, power 40→60.
  - Next: user tests the coach → read `logs/badminton-outcomes.jsonl` to tune → B4 (2v2).

### GitHub and the cloud (2026-10-31)
- Project is on GitHub: **private** repo `MartasLokaj/projekt-sport` (remote `origin`, branch `main`). `gh` CLI is in
  `~/.local/gh/bin/gh` (not on PATH; logged in as MartasLokaj, git credential helper set up with `gh auth setup-git`).
- The user connected GitHub to claude.ai and started their own **cloud session redesigning the Cube World hub**
  (they did not like the cube much). That work is on its own branch in the cloud: **don't touch `host/hub/` here**;
  merge its branch only when the user asks. This session continues with badminton (functionality).
- Push `main` after each milestone so the cloud can pick it up.
- **2026-10-31: merged the cloud's hub branch `claude/adoring-keller-x93qqh` (Cube World 2.0 K1–K2: title menu,
  new lobby UI `host/ui/`, living cube, confetti, fonts) into `main` on the user's request.** Merge was clean;
  checked in the dev browser: title → cube → Badminton → Play → game → Esc back to the cube, no errors.
- **2026-10-31: merged the cloud branch again (Minigolf G1–G3: checker turf, wooden borders, wider lanes, closer
  camera, meadows/hills/boulders; Badminton beach venue step 1: `host/badminton/venue/` beach, props, sea).**
  Clean merge; checked: badminton on the beach runs (~2.7 ms per frame), minigolf hole 1 loads, no errors.
- **2026-10-31: merged the cloud branch `claude/optimistic-ptolemy-k4bk8a` (Minigolf J1: ramps, gaps, tubes,
  holes 4 Pipe and 5 Ski jump) on the user's request**, plus committed the user's `AVATAR.md` brief (SPEC phase 5).
  Clean merge; type check passes, game modules load, badminton plays. Pushed `main`.
- **Minigolf fix (user: "can't get to the holes; the windmill's turning parts have big hitboxes"):** the holes
  shortcut failed only because the running server was from before the merge (3 holes) → restarted. Windmill: the
  drawn blades are an X (diagonals) but the hitboxes were a + (turned 45°), so the ball hit invisible blades. Now
  the hitboxes follow the drawn blades and are a bit smaller (`bladeHitboxLength` 0.9, `bladeHitboxWidth` 0.7 in
  `TUNING.course`); checked with the physics debug view.

### Kick players from the lobby (2026-10-31, user request)
- **2026-11-02 (user): a kicked player must type the code again, not just tap "Join again".** The phone now forgets the
  room code (`room = null`, URL back to `/play`, empty code box) and shows the room form "You were removed from the
  game. To play again, type the room code from the big screen."; the server also drops that socket from `phones`, so it
  gets no more lobby updates. Checked on a test server (kicked → 0 updates; joining with the code works again) and the
  phone page in the dev browser. Server changed → restarted.
- **Built, waiting for the user's test.** Hover a player's face under Play → red × (`.face-kick` in
  `host/hub/lobbyUi.ts`, styles in `host/ui/lobby.css`) → dialog "Kick Eva?" (`#kick-confirm` in `host/index.html`;
  Enter kicks, Esc cancels) → host sends `kick_player` → server (`server/lobby.ts`) deletes the seat (only outside a
  match), the phone gets `join_error: kicked` ("You were removed from the game" + "Join again" button). The face
  spins away; the cube character (`Hub.leave`) bursts confetti and spins up and shrinks away (any player who
  leaves now animates like that). Note: the dialog needs `#lobby-screen > #kick-confirm` to beat the
  `#lobby-screen > *:not(#hub-canvas)` z-index rule.
- Touches the cloud's hub files (`host/hub/`, `host/ui/`): tell the cloud session if it is still working there.
- User: "kick works, but the arrival and confetti don't". Cause: the hub only let a joiner drop in when somebody
  was already on the cube, so the first player (or a lone player re-joining after a kick) just appeared. Now
  everyone who joins after the first 1.5 s of the page (`Hub.quietUntil`) drops in with confetti.
- User: "really good!" Then (done): on the Badminton side the characters hold a racket in their shirt colour
  instead of the putter (`Character.setGear`, `heldRacket` in `host/hub/Hub.ts`, reusing `buildRacket`).

### Badminton beach venue (BADMINTON_BEACH.md) — step 1 built 2026-10-31, waiting for the user's OK
- Branch note: `main` had moved on (badminton mechanics steps 1–5); merged `origin/main` into
  `claude/adoring-keller-x93qqh` (with the minigolf G1–G3 commits) instead of rebasing (force push not allowed).
- **Step 1 — court and surroundings (done, screenshots shown):** venue code in `host/badminton/venue/`
  (`beach.ts` layout, sand, footprints, rope lines, net; `props.ts` palms, palapa, deck, umbrellas, rocks,
  feather flags, wind material; `sea.ts` sky, clouds, sea). `court.ts` keeps only the shuttle and rackets.
  Layout: court along z; west = stone wall + wooden deck with railing, closed green umbrellas, benches, sea
  behind; north = open beach sloping into the sea (wet sand, shore foam, patchy reef surf, horizon); east = two
  palms leaning over the court edge, palapa with tables and chairs, volcanic rocks (also at the NE waterline);
  south = palm groves and green hills. Feather flags (own design: green, shuttle + cube icon) by the net and at two
  corners. Rope court lines with pegs; black net with an orange top band that ripples. Palms, flags and the net
  band sway (vertex shader, `wind`). Static props = one mesh, palms one mesh, flags one mesh, clouds one mesh.
  The sun's shadow map is now worked out once per frame instead of once per split half.
  Measured in the dev browser (software GPU, 2 phones, split screen): 201 draw calls per frame for both halves
  (was 256 with the graybox, mostly the characters), ~300k triangles per frame; venue CPU work per frame is just a
  few shader values. **Real fps on the MacBook Air not measured yet.** All values in `TUNING.badminton.beach`.
- Step 1 approved in practice (user kept playing on it).
- **Steps 2–4 built 2026-10-31 (user: "zahaj krok 2 3 a 4"; the avatar menu is being made in another session and
  will offer the beach fit), waiting for the user's look + shuttle choice:**
  - **2 Players:** `Character.setOutfit(Outfit)` in `host/game/character.ts` (tee/tank, pants/shorts + colour,
    shoes/bare feet, optional headband; `DEFAULT_OUTFIT` = the old look, minigolf unchanged). Badminton dresses
    everyone in `TUNING.badminton.outfit`: tank top in the player's colour, shorts = that colour darkened
    (`shortsShade`), bare feet, white headband. Caps/visors/sunglasses are left to the avatar menu (AVATAR.md has
    Hat and Glasses) so they are not built twice. Reactions after a point (`pointReactionMs`): the winner jumps with
    both arms up and spins once, the loser slumps and kicks a little sand.
  - **3 Shuttle:** `buildShuttle()` in `court.ts`, `TUNING.badminton.shuttleStyle` 'classic' (white scalloped
    feather skirt with ribs and thread rings, coral cork with a navy band, thin dark outline, soft warm glow) or
    'red' (same shape, glowing red, gold band). Default 'classic' until the user chooses. Flies cork first.
  - **4 Rackets:** `buildRacket()`: grip tape (wrap texture) and frame in the player's colour (`setRacketColour`),
    silver shaft, T-joint, oval head with a string grid; same length from the hand as before (`racketScale` 1).
    Swoosh ribbon behind the head on every swing (`Swoosh` in `effects.ts`, `TUNING.badminton.swoosh`), gold after
    a Perfect (the frame still glows gold). Hub (`host/hub/Hub.ts`) uses the same `buildRacket`.
  - User chose the **white (classic) shuttle**.

### Badminton camera and shuttle flight, console-sports style (user, 2026-10-31, reference screenshot) — waiting for the user's look
- User: "make it look more like Nintendo; not the characters now (later); the camera angle and how the shuttle
  moves; you should see mainly the court, not what is around it."
- Camera low and close behind the baseline (`cameraHeight` 3.6, `cameraBack` 1.8, `cameraFov` 42, looks at
  `cameraLookAt` -2.5 / `cameraLookY` -0.5), follows the team sideways (`cameraFollowX` 0.6) and a little
  forwards/backwards (`cameraFollowZ` 0.35, from the deepest teammate), tips up for high shots (`cameraTiltFrom` 3,
  `cameraTiltFollow` 0.4): measured, a clear never leaves the top of the picture. Split screen: fov 56, back 2.4.
- **Camera redo (user, 2026-10-31: "you can't see the shuttle and sometimes not even the character; the camera must
  move with him and the shuttle must be visible").** Measured CPU vs CPU: before, the shuttle was out of the picture
  17 % of the rally (high arcs over mid-court, camera too low) and the player's feet 16 % (running back under the
  camera). Now the camera rides along behind the team (`cameraBehind` 5.5, `cameraHeight` 4.2, follows sideways
  `cameraFollowX` 0.8 and forwards/backwards `cameraFollowZ` 0.9 at `cameraFollowSpeed` 5) and looks
  `cameraLookAhead` 6 m ahead of itself at `cameraLookY` 0.5, base fov 50 (split 60, `splitCameraBehind` 5.2).
  `keepInView`: if the team's feet/heads or the shuttle would leave the picture (margin `cameraFrameMargin`), the
  view widens up to `cameraFovMax` 72, then narrows back slowly. Measured after: 0 of 537 frames with the shuttle or
  feet out (full screen), split screen 2 of 459 shuttle frames. Waiting for the user's look.
- **User (2026-10-31): "not bad, I see everything; but I don't like how fast he goes forward — keep a little
  distance and just reach out with the racket".** The receiver now stops short of the contact on its own side
  (`reachBack` overhead 0.15 / drive 0.5 / lift 0.8 m) and reaches with the lunge; running to the shuttle goes just
  fast enough to arrive after `footwork.arriveShare` 0.85 of the time left, at least `footwork.calmRunSpeed` 3.5 m/s
  (before: always at least `runSpeed`). Measured CPU vs CPU with many drops: a third less time running netwards,
  fastest 10 % of the forward running 12.1 → 9.6 m/s (the median stays ~7 m/s: `findContact` still picks the earliest
  reachable point, approved earlier). Side-view pictures: lunge with the racket reaching out, a step short of the shuttle.
- Lower arcs (same flight times): serve apex 3.8, clear 4.0, lift 4.2, wobble 3.6. Overhead contacts still at
  ~3 m high, 6–6.7 m from the net.
- Shuttle trail is now a glowing streak (two crossed ribbons, widest at the shuttle, fading to the tail; additive),
  `Trail` in `effects.ts`; white trails 450 ms.

### Badminton B4 — 2 v 2 (built 2026-10-31, user: "Bílý, postav B4") — **NOT TESTED (NEVYZKOUŠENO)**
- **The user cannot test it now (not enough phones). Come back to it when they have 3–4 phones; do not treat B4
  as approved until then.**
- `Badminton.ts` now has 4 seats (`seats`; 0/2 near side, 1/3 far side; `near`/`far` = seats 0/1 = team captains:
  camera, score, half of the screen); `athletes` = the ones in play (2, or 4 in 2 v 2). `start(players[], level,
  length, doubles)`, `onSwing(seat, …)`, `onCue(seat, cue)`.
- `host/main.ts`: 3–4 connected phones → 2 v 2 (1st + 3rd near side, 2nd + 4th far side, the computer fills
  empty seats); 2 → 1 v 1; 1 → vs CPU. Lobby card (`host/hub/faces.ts`, only the modes list touched): "2 v 2 ·
  Three or four phones · CPU fills in", maxPlayers 4, level row also for 2 v 2.
- Who hits: each teammate works out its contact (`findContact`); the best reach, then the earliest (80 ms
  buckets), then the shorter run goes (`receiverAthlete`); only that player's swing counts. Ring in their colour on
  the sand, phone cue `your_turn` ("Your shuttle!", short buzz on Android). The partner covers the other half
  (`laneOffset`); the hitting team goes back side by side (left stays left); `keepApart` keeps `minGap`.
  Serve: team serving with the same server while it keeps winning; winning the serve back → the team's other player
  serves (`lastServer`). Partners stand `partnerBack` further back at the serve. Camera follows the team's middle.
  Score shows "Martas & Tom 3 : 1 Eva & Ana". Tuning `TUNING.badminton.doubles`. The court is not widened (it is
  already 6.5 m wide, wider than a real doubles court).
- Scripted tests: 4 CPUs (each seat hits 3–5 times in 35 s, teammates ≥ 1.3 m apart, serve rotation s2→s3→s0→s1),
  two players in one team (only the receiver's swing counts, partner's ignored, cues sent), 1 v 1 and vs CPU still
  fine, no console errors. Not tested on real phones (needs 3–4 phones).

### Badminton: deeper shots, more running (user, 2026-10-31: "the shuttle should fly to the back line, more movement"; palms: keep ours)
- Clears, lifts and serves land right by the back line (depth up to 8.15 of 8.4) in a higher arc (apex 5.0–5.6),
  drives deeper too; players wait nearer the net (`homeDepth` 4.0), so they run back for every high shot.
  Measured with a scripted player vs the computer: overhead contacts moved from ~5 m to 6.5–7 m from the net.
- The camera tips up a little to follow a high shuttle (`cameraTiltFrom`, `cameraTiltFollow`, `cameraTiltSpeed`),
  so it never climbs out of the picture. Waiting for the user's test.

### Phase 5 — avatar system (AVATAR.md) — started 2026-10-31 on the user's request
Brief: `AVATAR.md`; screen design (approved): design canvas "Avatar editor – phone" linked there.
The user said: leave Phase 4's state as it is in this file; make the body like the design (arms more out from the
body, round mitten hands, sturdier legs, chunky shoes).
- **Step 1 — built (waiting for the user's test):** `shared/avatar.ts` = all options (ids + English labels as on the
  canvas), `AvatarLook` (eyes, mouth, blush, hair style/colour, hat, glasses, grip/putter colour), `AvatarProfile`
  (v1, + name, colour, skin, handedness), `sanitizeLook`/`sanitizeProfile` (unknown/missing → defaults; old phone
  profiles keep working), 6 `PRESETS`, `randomAvatar` (glasses ~30 %). Join message has an optional `look`; the
  server checks it (`server/lobby.ts`) and sends it in `PlayerInfo.look`. `host/game/character.ts` builds hair (6),
  eyes (5), mouth (4, grin with teeth), blush, hats (cap/visor/beanie in the player's colour; under a cap or beanie
  spikes, top curls, bun and fringe are left out), glasses (round/sun), putter grip+head in the putter colour;
  parts rebuild only when the look changes. `lookOf(player)` used by the hub, minigolf and badminton (CPU =
  default look). Body: legs/shoes sturdier, mitten hands with a thumb, arms out at `TUNING.character.armRest`.
  Test page **`/avatars`** (`host/avatars.html`, `host/avatars/gallery.ts`): every option, every hat on every hair,
  Random, Turn, Face close-up, Racket, Swing, Cheer/Jump/Clap/Scratch.
  Not yet: racket grip colour in badminton (step 4), phones still send no look (step 2), same colour still refused.
- **Step 1 approved** by the user ("ano funguje", 2026-10-31).
- **Step 2 — built (waiting for the user's phone test):** phone join screen = name, 3D preview of the character,
  **Customize**, sensitivity, Join (colour/skin/hand moved into the editor). Customize joins first (name needed),
  then opens the editor (user's OK), so the character is on the cube and edits show live. Editor =
  `#screen-editor` in `controller/index.html` (dark Cube World look, Nunito Sans; the other phone screens stay light
  until step 3, as proposed), `controller/avatar/editor.ts` (tabs Face/Hair/Clothes/Gear, Random, Save & play,
  Back; colours other players wear are disabled), `controller/avatar/preview.ts` (one WebGL canvas with the real
  `Character`, moved between join screen and editor; draws only while on screen, `TUNING.avatarEditor`
  previewFps/pixel ratio; drag to turn). Live updates: `set_look` message, at most 10/s
  (`TUNING.avatarEditor.sendIntervalMs`), only in the lobby / after a game; the server validates and broadcasts
  `lobby_state`; `saved: true` -> `player_look_saved` to the host -> `Hub.waveHello` (new mood `wave` + confetti).
  Each change: a small sparkle on the cube (`sparkleEvery`, `sparklePieces`; `Confetti.burst` got a piece count).
  The look is saved in the phone's profile (`minigolf.profile`, field `look`). "Edit character" in the lobby opens
  the editor directly. Note: the hub sets its own character scale, so left-handers are not mirrored on the cube
  (unchanged); the phone preview turns a left-hander round to face the camera.
- **Step 2 phone test 1 (user):** "editor works, but I can't see the character I'm editing" (3D preview empty on
  the real phone; fine in the desktop phone simulation). Added a fallback: if 3D cannot run (WebGL 2 missing, an
  error, context lost, no size), `controller/avatar/chibi2d.ts` draws the character in 2D (SVG from the design
  canvas) and a small note under it says why — waiting for the user's report of that note / phone model.
- Step 3: Quick start + Saved screen (+ the other phone screens in the dark look).
  Step 4: outfits per game + same-colour name tags (then drop the `colour_taken` refusal).

### Sounds (K3 + game sounds) — built 2026-10-31 (user: "ano, stáhni"), approved ("je to dobré"; music may be swapped later)
- Downloaded (user approved the list): Kenney Interface Sounds (0.80 MB zip), Impact Sounds (0.76 MB), Music Jingles
  (1.18 MB) via the site's Download button (zips in the user's ~/Downloads); OpenGameArt CC0: Beach Ocean Waves
  wave_01 (626 KB), Flowerbed Fields loop (lobby), Feel Good Island Loop (minigolf), Happy Ukelele Island Surfing Theme
  (badminton). 20 picked sounds + 3 music tracks converted to AAC `.m4a` (`afconvert`) in `host/assets/audio/`
  (4.2 MB, mostly music), credits in `host/assets/audio/CREDITS.md` + README. Sounds were picked by name and measured
  loudness (Claude cannot listen) — the user should listen; swapping a file = re-convert from the Kenney zip.
- `host/audio/sound.ts`: Web Audio; effects bus + music bus + master; music crossfades (`musicFadeMs`) and loops;
  waves on the beach as single waves every 3.5–7 s with random pitch; starts after the first key/click; M mutes
  (localStorage `cubeworld.muted`, badge "🔇 Sound off · M"). All levels in `TUNING.audio`.
- Where: lobby music, title buttons click, side chosen / let go, Play (dive), player lands on the cube / leaves,
  look-change sparkle; minigolf music, putt (louder + lower for strong shots), border knock (sudden turn of the ball,
  louder when faster), cup + jingle (hole-in-one has its own), splash; badminton music + waves, racket hit, smash,
  Super Smash jingle, shuttle lands in sand / falls off the net, point jingle, match win jingle, Perfect sparkle.
- Checked in the dev browser: all files decode, every event fires in play (minigolf and CPU-vs-CPU badminton), mute.
  Not done: phone sounds, a volume slider (only levels in tuning + M).

### Network change + New room (user, 2026-11-02: "why couldn't my phone connect with the hotspot?") — approved ("jeee funguje a je to mega")
- Cause: the server looked up the Mac's address only at start (2026-11-01 09:22, home Wi-Fi 192.168.1.131). On the
  phone's hotspot the Mac got another address (iPhone: 172.20.10.x), but the QR code / address still showed the old
  one. Mobile data never helps: phones talk to the Mac over the local network only.
- `server/index.ts`: every `TUNING.network.addressCheckMs` (4 s) `followNetwork()` compares `getLanAddresses()`; on a
  change: `ensureCertificate` (now keeps up to 8 earlier addresses, so switching back needs no new certificate; a new
  network still means one new security warning on the phones), `server.setSecureContext`, new `host_info` (address
  + QR) to every big screen (`Lobby.setHostInfo`), printed in the terminal. Room and players stay.
- **New room** button in the join panel (`#new-room`, `LobbyUi.onNewRoom`; first click asks "Everyone joins again ·
  click again", a second within 3.5 s does it) → `reset_room` → network looked up again, new room code
  (`Lobby.resetRoom`: seats cleared, match ended, lab off), phones get `join_error: room_reset` → room-code form
  "The big screen started a new room…" (`controller/main.ts`).
- Checked with a copy of the project on port 8444 and a fake network move (Node preload): address/QR changed, same
  room, certificate covers both addresses; reset → phone told, new code, old code refused, joining with the new code
  works. Button checked in the dev browser. **Server code changed → restart needed** (done in the "game server" tab).

### Minigolf juice (phase 4c) — built 2026-11-02 (user: "pusť se do efektů v minigolfu"), waiting for the user's look
- All values in `TUNING.minigolfFx`.
- **Hole intro**: every new hole the camera starts high above the cup (`introStartHeight` 5, `introStartBack` 3.5)
  and flies in an arc (`introArcHeight` 8 over the middle) to its spot behind the tee in `introSeconds` 2.6 (eased);
  banner "Hole 2/3 · Par 3" (`#hole-banner`, CSS in `theme.css`). Any aim / swing / Mac arrow or Space ends it at
  once (the camera settles from where it is). It replaces the swoop from the cube on the first hole. Measured: the
  camera stays ≥ 3.2 m from every flag pole on all 9 holes (it flew through the flag before the heights were raised).
- **Confetti** in the player's colour from the cup on every hole-in (`Confetti` in `host/hub/confetti.ts` now takes a
  style: size/speed/spread/life); **hole in one**: 6 bursts round the cup (gold + colour, sparkle sounds) and the
  message turns gold and bounces (`#hud-message.hole-in-one`).
- **Ball trail**: faint white streak (badminton's `Trail`) while the ball rolls faster than `trailSpeed` 1.2 m/s.
- **Camera nudge** on the hit: 0.01–0.05 m shake for `nudgeMs` 180 (by power), removed again each frame.
- **Phone vibration** when my ball drops in (Android; iPhone cannot): `controller/main.ts` watches `game_state`
  (done → holed), longer pattern for a hole in one. No server change.
- **Wind**: the KayKit plants sway (vertex shader via `onBeforeCompile` in `vegetation.ts`, `windTime` uniform moved by
  the game and the hub; `windSway` 0.035 of the height, per-plant phase, gusts). Shadows do not sway.
- Checked in the dev browser: intro on all holes, banner text, hole in one (confetti, gold message), trail on a
  80 % shot, nudge, wind clock and shader compiled. Not checked: vibration on a real Android phone; fps on the MacBook Air.

### Podium after a match (both games) — built 2026-11-01, tested by the user 2026-11-02 ("vyzkoušeno", no complaints)
- `host/results/Podium.ts` (own WebGL canvas, `#podium-screen` styles in `theme.css`, tuning `TUNING.podium`):
  1st step in the middle (highest), 2nd left, 3rd right, numbers on the fronts; shared places stand together on one
  step, 4th and lower beside it on the ground; one name tag per place ("Martas & Tom · 1st · 4 points", 👑 for
  the winners); sky gradient + ground per game (meadow for minigolf, beach sand for badminton, fog into the sky);
  camera swoops down then sways; winners alternate jump / cheer under confetti bursts (with a sparkle sound), the
  others clap; win jingle. Buttons Play again (Enter) and Back to the cube (Esc); while it shows, Enter/Esc are caught
  before the games' own keys.
- Minigolf (`host/main.ts`): on `game_end` → flash → game paused → podium (`minigolfPodium`: ranked by total strokes,
  equal totals share a place, "Martas wins!" / "It's a tie!", "Minigolf · 3 holes"). The final scoreboard table no
  longer shows (hole_end still does). Play again sends `start_game` with the chosen course → flash → back to the
  course, camera glides in. Esc → `end_game` → back to the cube (podium hidden in `leaveGame`).
- Badminton: `Badminton.onMatchOver` (last point; the point jingle plays, the win jingle comes with the podium) →
  after `badmintonDelayMs` 1800 (reactions) → podium (`Badminton.podium()`: winning team 1st, others 2nd, points,
  "Martas & Tom win!", score line). Play again restarts the match with the same players / level / length / 2 v 2.
  Athletes now keep their `look` for this.
- Checked in the dev browser (fake server): minigolf 4 players (win and tie), Play again and Esc; badminton 2 v 2
  CPU match to the end, Play again (0 : 0, new match), Esc back to the cube; no console errors.
- Not done yet: match intro (players side by side + 3-2-1).

### Minigolf course choice (user, 2026-11-01: "add a 3 hole course with 3 random holes of the 9") — approved ("je to pecka")
- Lobby card (Minigolf): mode "Course · {course} · take turns, lowest total wins" + a Course row **3 holes / 9 holes**
  (`TUNING.rules.courses`, first = default = 3 holes; `LobbyUi.course`, `FaceInfo.courses`, same row element as the
  badminton Match row, label switches).
- Server: `start_game.course` ('short' | 'full'); `pickCourse()` in `server/lobby.ts` picks 3 random holes kept in
  course order; the lobby remembers the last course, so a start from the leader's phone or "play again" reuses it
  (a new random draw each game). `?hole=N` testing always plays the full course. `Match` plays `course: number[]`;
  `GameState.course` (indexes into HOLES), `hole` = position in it, `holeCount` = its length.
- Host: `Game` loads `HOLES[course[hole]]`, HUD "Hole 2/3"; scoreboard columns show the real hole numbers (e.g. 1 4 8).
- Checked: test server (4 random draws, full, phone start reuses last course, ?hole shortcut) and the dev browser
  (card row, a 3-hole game loads the right holes, HUD and scoreboard). **Server code changed → restart needed.**

### Stale server (2026-11-01): "only 5 holes" and "live character edits don't work / aren't saved"
- Both were the same cause: the running `npm run dev` had been started at 13:53 on 2026-10-31, after Minigolf J1
  (HOLE_COUNT 5) but before J2/J3 (9 holes) and avatar step 2 (`set_look`) were merged. Server code only changes
  on restart, so the server ended games after hole 5 and ignored `set_look`; on every reconnect its old look in
  `joined` overwrote the phone's saved look (so it looked "not saved").
- Checked against a fresh test server (port 8444, Node `ws` client): set_look reaches the host
  (`player_look_saved`), the new look comes back after a reconnect, `holeCount` 9. Restarted the user's server in
  the Terminal panel tab "game server" (the old process was gone by then — possibly stopped by a cleanup command).
- Also: the lobby card said "3-hole course" → now `${HOLE_COUNT}-hole course` (`host/hub/faces.ts`).
- Lesson: after merging anything that touches `server/` or `shared/`, tell the user to restart the server.
- After the restart the user said "je to mega dobré": live character editing and saving work (avatar step 2 OK; whether
  the phone shows the 3D or the 2D preview is still not reported).

### Approvals 2026-10-31 (evening)
- User: "je to mega dobré" — **K4 dive-in transition, the new badminton camera, the footwork change (stop short +
  reach, calmer runs) and the gentle return to the cube are approved.** "We'll work a lot on the graphics later."
- User: "golf se mi taky hraje dobře", then "jamky jsou top!" — **Minigolf J3 (holes 8 Bridge, 9 Finale) approved;
  all 9 holes approved.**

### Skiing (SPEC §15, brief `SKI.md`) — started 2026-11-10 on the user's request
- The user added `SKI.md` + SPEC §15: downhill ski race, phone held sideways like a steering wheel. Phases S1–S5.
  The reference screenshots did **not** arrive with the message (text only): ask for them again before S3 (look).
- **S1 tilt steering prototype — built (user: "Ano, postav S1"), waiting for the user's phone test.**
  - Cube: the side that was `mystery-2` is now `ski` ("Skiing · Prototype"; its little world is still the building
    site until S5; icon still the mystery one). Play/Enter → server `ski_mode` → `ski_state` to everyone. Lab, curling,
    skiing and a minigolf match shut each other out (`server/lobby.ts`; the only touch on curling/badminton code paths).
  - Phone: `controller/ski/screen.ts` (`#screen-ski`): "Hold the phone sideways… press Ready" → Ready sets neutral
    (on iPhone the same tap asks for the motion permission), the button then says Re-centre; meter + degrees; sends
    `ski_steer {steer, roll, ready}` every 33 ms. With the rotation lock on (page stays upright) the content turns
    90° to stay readable (direction from gravity; uses the same iPhone/Android sign rule as the badminton lab).
  - Maths: `controller/ski/steer.ts` `WheelSteer`: roll = turn of gravity inside the screen's plane since Ready, so
    it is the same for both landscape ways and for either gravity sign (checked in a script: 4 combinations give
    identical numbers). Dead zone 3°, full at 40° ÷ sensitivity, curve exponent 1.5, smoothing 70 ms, "too flat"
    guard. ±1.5° hand tremor → steering 0.
  - Big screen: `host/ski/Ski.ts`: white slope with a grid (14°), blue edge lines, rows of grey boxes (same places
    every run), chibi on skis at constant 14 m/s; steering = direction (full = skis 50° off the fall line, neutral =
    straight down), leans into turns; a touched box turns red and is counted (no crash yet); level chase camera;
    readout: phone tilt, steering %, skis °, boxes hit, frame ms. One phone steers at a time (the first heard, until it
    is silent 1 s). Mac ← → steer, Esc back. No jump / tuck yet (S2).
  - Log: `logs/ski-steer.jsonl`, one sample per phone every 100 ms (t, player, sensitivity, roll, steer).
  - Checked: type check; steer script; test server on 8444 with a `ws` client (routing, clamping, mutual exclusion,
    log); dev browser with a fake socket (cube card, dive in, phone steering both ways, keys, red box, Esc back; phone
    page in landscape and in upright-page mode). ~1.5 ms work per frame in the dev browser.
  - **Not verified on real phones:** whether right tilt = right turn (if mirrored: flip the sign in `WheelSteer.roll`),
    the feel (dead zone / 40° / curve / `headingResponse`), the turned text direction with the rotation lock on, iPhone
    permission from the Ready tap. Real fps on the MacBook Air not measured.
  - **S1 approved by the user on a real phone (2026-11-10): "zatáčení funguje top!"** No tuning changes needed.
  - **Reference screenshots arrived (2026-11-10, 4 frames from the trailer the user likes; inspiration only, never
    name it in code or game text).** What they show, for S3/S4: low chase camera right behind the skier, sometimes
    beside another racer; a narrow valley run between big warm-orange faceted cliffs and dark rocks in cool blue
    shadow; dense snowy firs on the sides; jagged peaks far away; sunlit snow creamy, shadowed snow deep blue; long
    tree shadows across the run; two deep ski grooves + a pale spray trail; short white speed streaks on the snow;
    floating sparkles; strong low sun glare/bloom when facing the sun; skiers crouched with poles out, chunky
    proportions, bright outfits (helmet or beanie, goggles); edge motion blur at speed.
  - **S2 plan (user OK'd, "ano chci S2a"):** S2a = one racer on a real run; S2b = 1–4 phones + CPU (levels in the
    lobby), shared pack camera, catch-up / respawn near the pack, finish order + snowy podium. Tuck is a button for
    now (tilting the phone towards you maybe later).
  - **S2a — built 2026-11-10, waiting for the user's phone test.**
    - Run (`host/ski/course.ts`, `TUNING.ski.course`, seed 7): 1050 m start→finish + 90 m run-out; bends up to ~30°
      (`centre(d)` = two sine waves, straight first 60 m and last 70 m); steepness 12–22° (`slopeDeg` 17 ±5); width
      20–40 m; valley walls rise 9 m over 16 m outside the edges; 3 roller sections; 3 kickers (1.6 m, coloured orange
      so they can be seen); 10 gates (red/blue flag pairs, +2.5 m/s and a flash when ridden through); forest of ~1800
      firs on the walls (instanced, per 100 m piece, only pieces near the skier drawn), tree islands and rocks in the run;
      START / FINISH arches.
    - Physics (`RacerPhysics` in `host/ski/racer.ts`, `TUNING.ski.physics`): gravity along the skis' direction,
      friction 0.04, drag 0.005 (tuck ×0.6, turns ×0.6), carving brake by turn rate, min 3 m/s; the skier takes off
      when the ground falls away faster than gravity (roller crests, kicker lips); JUMP hold = crouch (up to 0.5 s),
      release = 4.2 m/s up from the slope (~0.9 m, ~0.9 s); crash on a tree/rock faster than 6 m/s: 1.5 s tumble + puff,
      then on at 6 m/s. Steering: same approved S1 maths; "straight" = half the run's bend (`alignToCourse` 0.5).
    - Simulated in Node (scripted skier): 62–88 s per run, top speed ~70–87 km/h, ~6–8 s in the air per run.
    - Race (`Ski.ts`): waits at the gate until the steering phone pressed Ready (or a Mac key), 3-2-1-GO, timer,
      finish → "Finished! 1:12.4" / "New best!" (best per player name while the page is open), braking in the run-out,
      Race again (phone button or Enter), R restarts. Chase camera low behind, between the run's direction and the
      skis', further back and wider at speed. Readout: speed, tilt, steering, tuck/jump, gates, crashes, frame ms.
    - Phone: TUCK (left) and JUMP (right) big thumb pads appear after Ready; button changes are sent at once;
      cues `ski_cue` go / crash / land / land_big / gate / carve / finish (Android vibration; status line "GO!",
      "Finished! 1:12.4" + Race again button).
    - Checked: type check; Node simulation; test server on 8444 (tuck/jump forwarding, again, cue validation, phones
      cannot send cues); dev browser with a fake socket (countdown, racing, kicker flight 1.9 m, jump 0.9 m, crash into
      a tree with a puff, finish + cue + race again, phone pads in landscape). ~2 ms of work per frame in the dev browser.
    - **Not verified on real phones:** whether the speed, bends and the 50/50 "straight" feel right, whether the thumb
      pads are reachable while holding the phone like a wheel, vibration on Android. Server code changed → restart.
  - **User's phone test of S2a (2026-11-10): "too slow, too few obstacles and too little that makes me turn; more
    flags, more trees; a narrower run that bends more to the sides, into places where you can't see far."**
    Done (same day): run 1350 m, half width 9 ±3 m (was 15 ±5), bends up to ~49° every ~55 m (`bendSize` 42,
    `bendLength` 55, `wiggleSize` 10, `wiggleLength` 26), steeper (23° ±6), steep valley walls (12 m over 9 m) with a
    denser forest right at the edge (spacing 4.2, density 0.9) → blind corners; 38 gates (every 32 m, alternating
    sides at half the half width, 5 m wide, +3.5 m/s); tree islands every ~55 m on one side of the run (2–4 trees, the
    other side stays open), rocks every ~20 m, nothing in a gate's opening; 3 kickers (7 m wide). Physics: friction
    0.03, drag 0.0032, carving brake 0.12, min speed 5, crash above 8 m/s, get up at 10 m/s, then `ghostSeconds` 1 s
    passing through obstacles (no crash loops); wall clamp no longer causes false take-offs.
    Scripted "decent player" (looks ~1 s ahead, takes the free line, goes for gates): 75–92 s, average 60–77 km/h,
    top ~115–127 km/h, 1–8 crashes. Checked in the dev browser: valley look, gates, rocks, ~1–3 ms work per frame.
  - **Idea for later (user): mystery boxes on the run that give a mega speed boost etc.** (fits SKI.md "items").
  - **Faster run approved by the user on the phone (2026-11-10): "je to mega dobré".** S2a done. The user will ask
    friends tomorrow about small details; told them run/gameplay values stay easy to change after the look (S3)
    because the look is built on the same generator and `TUNING.ski`; only big structural ideas (forks, tunnels,
    hand-placed spots) are best decided before S3.
  - **User (2026-11-10): "add the fork (rozdvojení trati), start S2b".** (Asked which: the user chose the fork, not
    mystery boxes.)
  - **Forks + S2b — built 2026-11-10, waiting for the user's phone test (ideally 2 phones).**
    - Forks (`TUNING.ski.course.forks`): at 27 % and 62 % of the run, 190 m long, 50 m to split/join. `Course.lanes(d)`
      gives one way or two ([safe, risky]); risky = straight, narrow (half width 4.5), rocks every ~16 m and its own
      kicker; safe = wider (7), winding (`safeWiggle` 6) with the gates. Between them a forested ridge ~18 m wide and
      ~12 m high (no view across). A FAST / SAFE signpost (×1.8) at the ridge's nose (can be hit). Forest now fills
      everything off the run (walls and ridges); edges drawn per way; `direction(d, x)` follows the way you are on.
    - Race (`Ski.ts`): 4 racers = connected phones in join order (max 4) + "CPU 1…" in free shirt colours; no phone →
      racer 1 on the Mac keys. Starts when every phone pressed Ready ("Waiting for Tom to press Ready"), Mac key starts
      at once. Camera follows the leading player still racing; pulls back/up while another player is 0–40 m behind.
      Catch-up: >15 m behind the leading player → push up to 3 m/s² (full at 60 m); >90 m behind or >45 m for 3 s →
      put back 12 m behind the leader on the leader's way (phone: "Back with the pack!"); CPUs >30 m ahead held back
      up to 2.5 m/s². Racers bump apart (no crash). Name tags (seen through the ridge), standings list (place, colour,
      name, time). All players through → 3 s → podium (snowy; places by time, unfinished CPUs by estimated time);
      Play again = Enter or a phone's Race again; Esc / Back → cube. Phone finish text "Finished 2nd! 1:12.4".
    - CPU (`host/ski/cpu.ts`, `TUNING.ski.cpu`): rethinks every 90–260 ms, looks 0.6–1.1 s ahead, picks the free line
      (gates a little), wobble, tucks on straights, jumps kickers, risky fork chance 20/40/70 %, push −0.8/0/+0.5.
      Simulated alone: easy ~105–110 s, normal ~95 s, pro ~80–98 s (they crash too; catch-up keeps them near players).
    - Checked: type check; Node simulation; dev browser with a fake socket and 2 fake phones (waits for both Ready,
      countdown, racing, forks with CPUs splitting, crash, finish cues with places, snowy podium, phone Race again →
      new countdown), ~2–3.5 ms work per frame. Server changed (place in `ski_cue`) → restart.
    - **Not verified on real phones:** whether two players can follow each other on one camera, whether catch-up /
      respawn feel fair, CPU strength, fork sign readability.
  - **User (2026-11-10): "against the CPU it plays great, let's continue, the rest we tune tomorrow".** One phone vs
    CPU approved (incl. forks). **2+ phones on one camera NOT TESTED yet (no friends around)** — check when they can;
    tomorrow the user asks friends about details.
  - **S3 step 1 — built 2026-11-10, waiting for the user's choice of lighting.** `TUNING.ski.look`: three presets
    (`golden` A · Golden morning = default, `crisp` B · Crisp midday, `sunset` C · Late sun); **L on the Mac cycles them
    live** (`Ski.setLook`), the readout shows which. Warm sun + strong saturated-blue hemisphere light = blue shadows.
    `host/ski/backdrop.ts`: gradient sky dome with a warm haze round the sun, sun glow sprite, ring of 30 jagged far
    mountains with snow tops (follows the camera). `course.ts`: snow texture with faint specks (grid gone, edge lines
    hidden: `look.edgeLines`), firs with snow on most branches (two instanced shapes: needles + snow), faceted ochre
    rocks with snow caps, big cliffs on the valley walls every ~18 m (visual only), colours via `applyLook`.
    Screenshots of A/B/C in `logs/ski-look-*.jpg` (not in git). ~3 ms work per frame in the dev browser.
    Known: sunlit snow in A is a little lavender (blue sky light adds to the sun) — tune after the choice.
  - **User chose A · Golden morning (2026-11-10).** Tuned: sun `#ffe3c2` × 4.2, sky light 1.7, exposure 0.85 →
    sunlit snow creamy instead of lavender, shadows still saturated blue. B and C stay in tuning (L cycles).
  - **S3 step 2 — ski outfits, built, waiting for the user's look.** `Outfit` in `host/game/character.ts` got optional
    fields (defaults = old look, minigolf/badminton unchanged): `top: 'jacket'` (whole arm in the player's colour),
    `gloves`, `shoeColour`, `helmet` (helmet in the player's colour + goggles pushed up on it; replaces the avatar's
    hat/glasses, face stays visible); `freeArmPose` + `freeArm` for the left arm. `Racer.setLook` dresses every skier:
    jacket, darker trousers (`TUNING.ski.outfit`), dark gloves and boots, helmet, two poles from the hands; arms out
    with the poles, hands together in a tuck, arms wide in the air. Screenshot `logs/ski-look-A-outfits.jpg`.
    The podium still shows the players in their normal clothes.
  - User (2026-11-10): "tune Late sun too" → preset C retuned the same way (sun `#ffc890` × 4.2 at 14° from
    ahead-right, blue-violet sky light 1.95, exposure 0.85): peach-gold sunlit snow, deep blue shadows, orange horizon.
    Default stays A (`look.preset`); if the user prefers C, change that one value.
  - Next: user's look at S3 → fixes → S4 juice (ski tracks, spray, speed lines, sparkles, sun glare, camera shake,
    sounds/music — ask before any download). Still open: 2+ phones test, friends' feedback on the run.

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
- **Curling (user, 2026-11-02): chosen as the next sport** (SPEC §14). Decided: frozen pond, sweeping by
  shaking the phone, Quick/Normal/Long; the user OK'd the proposed rules ("realistic": aim only before the throw,
  sweeping only changes distance and curl; arcade steering maybe later). Idea for later: boxing, two phones vs CPU.
  - **C1 graybox — built, waiting for the user's phone test.** Curling side of the cube (top side, was mystery-1;
    snowy pond diorama, stone icon) → Play/Enter → server `curling_mode` → `curling_state` to everyone: phones hide
    the "You're in!" overlay and show the minigolf aim+swing screen; any phone's stroke throws the next stone
    (`host/curling/Curling.ts`, tuning `TUNING.curling`). Own simple 2D physics (no Rapier): steady friction,
    curl from the swing twist (`curveFromTwist` sign, more curl as the stone slows), equal-mass bounces; out off
    the sides / past the back line / short of the far hog line untouched. 8 stones per end, then the ice clears.
    Camera behind the thrower → follows the stone → above the house for 2.5 s. Mac keys: ← → aim, hold Space,
    A/S/D curl, R clears, Esc back. Minigolf start is blocked while curling is open (and lab vs curling).
    Tested in the browser with a fake socket: 66 % power stops on the button (~5.8 s slide), 40 % is taken off.
    No curling music yet (lobby music plays).
Summary of what is left, given to the user on 2026-10-31 (waiting for them to pick what comes first):
- **Badminton:** B4 2 v 2 built but NOT TESTED (waiting for 3–4 phones); phone test of the coach (then tune from `logs/badminton-outcomes.jsonl`); beach venue steps 2–4
  (beach outfits, shuttle look with 2 options, rackets); B4 2v2; sounds/music; intro + results screen (K4);
  real 60 fps check on the MacBook Air with two phones; later: Badminton face on the hub (B5), other venues.
- **Minigolf:** J2 (holes 6 Castle, 7 Banked U-turn) and J3 (8 Bridge, 9 Finale), then `HOLE_COUNT` 9 and maybe a
  3/9 holes choice; 4c juice (hole intro, confetti, trails, camera nudge, sounds, vibration, podium, wind);
  60 fps check; small open points (windmill tile's orange side walls, trees blocking the camera at bends).
- **Shared:** Cube World K3 sounds, K4 dive-in/intro/results, K5 phone lobby screen; Phase 6 polish (settings,
  playtest with friends).
- **Phase 5 avatar (AVATAR.md):** step 1 approved; step 2 (phone editor, live on the TV) built → user tests it on
  real phones → step 3.
