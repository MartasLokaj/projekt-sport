# Project status — read this first in a new chat

Last updated: 2026-10-31. Read `CLAUDE.md` and `SPEC.md` too (SPEC is the source of truth; this file is the
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
- **4c Juice — not started:** hole intro fly-over with "Hole N · Par P", confetti on hole-in (+ special hole-in-one
  celebration), ball trail, impact particles, small camera nudge on hit, sounds (Kenney CC0 audio — ask before
  download), phone vibration on hole-in (host → server → phone `vibrate` message), podium with winner celebration,
  playful open-licence font stored locally (e.g. Fredoka, OFL — ask before download).
- **Done when (SPEC):** looks good enough to show friends and runs at 60 fps on the MacBook Air (**fps on the real
  MacBook Air not verified yet**; in the dev browser a frame takes < 1–3 ms of CPU).

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
  - **K4** dive-in transition, match intro (players + 3-2-1), results screen with Play again / Back to the cube,
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
- Next: user OK on step 1 (tweaks), then step 2 players (beach outfits), 3 shuttle (2 options), 4 rackets.

### Badminton: deeper shots, more running (user, 2026-10-31: "the shuttle should fly to the back line, more movement"; palms: keep ours)
- Clears, lifts and serves land right by the back line (depth up to 8.15 of 8.4) in a higher arc (apex 5.0–5.6),
  drives deeper too; players wait nearer the net (`homeDepth` 4.0), so they run back for every high shot.
  Measured with a scripted player vs the computer: overhead contacts moved from ~5 m to 6.5–7 m from the net.
- The camera tips up a little to follow a high shuttle (`cameraTiltFrom`, `cameraTiltFollow`, `cameraTiltSpeed`),
  so it never climbs out of the picture. Waiting for the user's test.

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
Summary of what is left, given to the user on 2026-10-31 (waiting for them to pick what comes first):
- **Badminton:** phone test of the coach (then tune from `logs/badminton-outcomes.jsonl`); beach venue steps 2–4
  (beach outfits, shuttle look with 2 options, rackets); B4 2v2; sounds/music; intro + results screen (K4);
  real 60 fps check on the MacBook Air with two phones; later: Badminton face on the hub (B5), other venues.
- **Minigolf:** J2 (holes 6 Castle, 7 Banked U-turn) and J3 (8 Bridge, 9 Finale), then `HOLE_COUNT` 9 and maybe a
  3/9 holes choice; 4c juice (hole intro, confetti, trails, camera nudge, sounds, vibration, podium, wind);
  60 fps check; small open points (windmill tile's orange side walls, trees blocking the camera at bends).
- **Shared:** Cube World K3 sounds, K4 dive-in/intro/results, K5 phone lobby screen; Phase 5 avatar editor
  (AVATAR.md); Phase 6 polish (settings, playtest with friends).
