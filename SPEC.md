# Projekt-sport — Game Spec

"Projekt-sport" is only the working name of the project folder. The final English in-game title will be chosen later; until then use a neutral placeholder title in the game (e.g. "Minigolf Party").

## 1. Vision
A cosy party minigolf game for 2–4 players in the same room, inspired by the feel of Nintendo Switch Sports.
The game runs in a web browser on a computer (the "host", a Mac, optionally shown on a TV).
Each player uses their own phone as the controller. No app install: players scan a QR code, the phone opens a web page, and they swing the phone like a putter.

Style: cute chibi characters (big head, small body), bright colours, soft lighting and lots of "juice" (satisfying feedback).
The art, characters and names must be original. We take inspiration from the feel only. Do not copy Nintendo characters, Miis or any other existing IP.

## 2. Hard requirements
- Language: English everywhere in the game (menus, buttons, messages).
- Players: 1–4, local, on the same Wi-Fi. Turn-based.
- Host: desktop browser (Chrome or Safari) on a MacBook Air with Apple Silicon. Target 60 fps.
- Controllers: Safari on iPhone and Chrome on Android. No native app.
- The server runs locally on the host Mac. No cloud, no accounts. No internet needed while playing.
- Only free, openly licensed assets (CC0 preferred). Course pieces: Kenney "Minigolf Kit" (kenney.nl, CC0).

## 3. Architecture
One project with three parts:
- `server/`: Node.js. Serves the host page and the controller page over HTTPS on the local network (bind to 0.0.0.0). Runs a WebSocket hub and owns the lobby, turn and score state.
- `host/`: the Three.js game shown on the big screen (course, ball, characters, camera, UI).
- `controller/`: the lightweight mobile web page used as the controller.

Suggested stack (propose alternatives only with a clear reason): TypeScript, Vite, Three.js, Rapier (`@dimforge/rapier3d-compat`) for ball physics, `ws` for WebSockets.

- Ball physics runs on the host, which is the single source of truth for the ball. The server is authoritative for lobby, turns and scores; the host reports "ball at rest", "hole in" and "out of bounds".
- JSON messages over WebSocket, at minimum: `join {name, colour}`, `lobby_state`, `start_game`, `your_turn`, `aim {angle}` (throttled to about 20 per second), `stroke {power, angle}`, `ball_resting`, `hole_in`, `hole_end {scores}`, `game_end`, `vibrate {pattern}`.
- Every game has a short room code, so an old phone tab cannot join the wrong game.
- Reconnect: a phone that drops (screen lock, Wi-Fi blip) automatically rejoins its seat using an ID stored in the phone's localStorage.

## 4. Networking and HTTPS (critical)
- Mobile browsers only give access to motion sensors on secure (HTTPS) pages, so the controller page must be served over HTTPS.
- Create a local certificate for the Mac's LAN address (for example with mkcert, or a self-signed certificate generated on first run). Write down the one-time steps for players (accept the warning on the phone, or install the local root certificate).
- The server prints, and the host screen shows, the LAN URL and a QR code encoding `https://<lan-ip>:<port>/play?room=<code>`.
- If phones cannot reach the host, show a friendly explanation: same Wi-Fi needed, guest networks may block devices from seeing each other, and macOS may ask to allow incoming connections (tell the user to click "Allow").
- Keep the phone screen awake during play (Screen Wake Lock API, with a fallback).

## 5. Phone controls
- Join screen: name (max 12 characters), shirt colour picker, big "Join" button.
- iPhone: ask for motion permission (`DeviceMotionEvent.requestPermission()`) from a button tap. If it is denied, explain how to fix it and offer the fallback controls.
- Waiting screen when it is not your turn (shows whose turn it is).
- Your turn:
  - Aim: drag a finger left/right to rotate the aim. The host shows an aim arrow / dotted line in real time.
  - Swing: hold a big "HOLD & SWING" button, swing the phone like a putter (back, then forward), release.
  - Power = peak forward angular velocity from the gyroscope (`rotationRate`), optionally combined with acceleration. Map it to 0–100 % with a soft curve, clamp it, and ignore tiny movements (deadzone). Exactly one stroke per swing.
  - Show a power meter on the phone during the swing and on the host after the hit.
  - Fallback mode (setting, and automatic when no motion sensor is available): pull back with the finger and release, like a slingshot.
- Haptics: `navigator.vibrate` on the hit and on hole-in where supported. iPhone Safari does not support it, so degrade gracefully.
- Big, thumb-friendly UI, portrait orientation, usable with one hand.
- Handedness (left / right) and per-player swing sensitivity: planned, added only after the swing works well (see Phase 2b). Until then, keep the swing axis, direction and sensitivity in the tuning config so they can later become per-player settings without a rewrite.

## 6. Gameplay rules
- Lobby: the host screen shows the QR code and the joined players with their characters. "Start" from the host (keyboard/mouse) or from the first player's phone.
- Prototype course: 3 short, fun holes (par 2–4) with growing difficulty: (1) a simple bend, (2) a ramp or bridge, (3) a windmill or other moving obstacle.
- Players take one stroke each in a fixed order. Players who have holed out are skipped.
- Maximum 6 strokes per hole; after that the ball is picked up and the player scores 7.
- Out of bounds or water: the ball returns to its last position, +1 stroke.
- Score = strokes per hole. Scoreboard after every hole. Final podium with a winner celebration. Hole-in-one gets a special celebration.

## 7. Camera and presentation
- Hole intro: a short fly-over of the hole with the hole number and par.
- Aiming: camera behind the active ball, aim line visible.
- After the hit: the camera follows the ball smoothly and settles when it stops.
- HUD: active player (name, colour, character face), stroke count, hole and par, compact scoreboard. Readable from a sofa.

## 8. Characters
- Style: chibi. Head about 45–50 % of total height, small rounded body, stubby arms and legs, simple friendly face (eyes, mouth). Built from primitives in code (spheres, capsules, rounded boxes) with soft shading. Original design.
- Prototype customisation: shirt colour and skin tone.
- Procedural animations (no rigging needed): idle breathing/bob, looking at the ball, putting swing synced to the real stroke, happy jump with arms up (hole-in), small cheer (good shot), slump or head-scratch (miss), hop to the ball.
- On their turn, the player's character stands next to their ball. Other characters wait at the side.
- Left-handed players' characters stand and swing mirrored (after Phase 2b).

## 9. Art direction
- Bright, cheerful and soft: sky gradient with soft clouds, warm sunlight with soft shadows, gentle bloom on highlights, stylised grass on the course, decorative props around the holes (trees, flowers, rocks, water).
- Course pieces from the Kenney Minigolf Kit (GLB/GLTF), re-coloured and re-lit to match our palette.
- Juice: confetti burst on hole-in, ball trail, impact particles, small camera nudge on the hit, satisfying sound effects (CC0, e.g. Kenney audio packs), optional light background music.
- UI: rounded, chunky, playful open-licence font (e.g. from Google Fonts), high contrast.

## 10. Phases and definition of done
Work in this order. Each phase ends with the user testing on real phones and approving it.

**Phase 0 – Setup**
- Check prerequisites on the Mac (Node.js LTS, git). Install what is missing after asking.
- Scaffold the project, initialise git, write a short README and fill in the Commands section of CLAUDE.md.
- Evaluate the open-source skill pack https://github.com/majidmanzarpour/threejs-game-skills: read it, summarise what it installs and runs, recommend yes or no, and wait for the user's decision.
- Done when: one command starts everything and prints the URLs.

**Phase 1 – Phone ↔ host connection (highest risk, do it first)**
- HTTPS server on the LAN, room code, QR code on the host page, controller page that joins.
- The host shows every connected phone with a live readout: aim angle from the finger drag, and the measured power after a swing.
- Done when: an iPhone (and an Android phone if available) joins by scanning the QR code; one swing reliably produces exactly one stroke with sensible power (a soft and a hard swing are clearly different); it feels instant; reconnecting after the screen locks works.

**Phase 2 – Graybox gameplay**
- One hole made of simple grey blocks, Rapier ball physics, aim line, stroke from the phone, turn order for 2–4 players, stroke counting, hole-in detection, out-of-bounds reset.
- Done when: a full hole is playable and fun with two phones and the user approves the feel.

**Phase 2b – Handedness and swing sensitivity**
- Start only after the user confirms that the swing works well in Phase 2.
- Each player picks "Right-handed" or "Left-handed" on the phone (saved in the phone's localStorage together with the rest of the player profile).
- Swing detection mirrors the axis/direction for left-handed players, so the same natural putting motion works for both.
- Per-player swing sensitivity slider (for example 50–150 %), so players with a gentle or strong swing get comparable results.
- Done when: a left-handed and a right-handed player both get natural, comparable power from the same effort.

**Phase 3 – Characters v1**
- Chibi characters with shirt colour and skin tone and the procedural animations from section 8, standing at the ball on their turn.
- Done when: every player is easy to recognise on screen and the swing animation plays in sync with the real stroke.

**Phase 4 – Art and juice**
- Three holes built from the Kenney kit, lighting, sky, shadows, decorations, camera work, particles, sounds, phone vibration, hole intro, scoreboard and podium.
- Done when: it looks good enough to show friends and runs at 60 fps on the MacBook Air.

**Phase 5 – Character editor on the phone**
- Options: hairstyle (5+), eyes (5+), mouth (4+), hat (4+ including none), shirt colour, skin tone, putter colour. Live 3D preview on the phone. Saved in the phone's localStorage and shown on the host after joining.
- Done when: players can create a character and keep it between sessions.

**Phase 6 – Polish**
- Title screen, how-to-play screen with an animated swing demo, settings (sound, music, swing sensitivity, fallback controls), "Play again" at the end.
- Playtest with friends and fix the top issues.

## 11. Out of scope for now
Online play over the internet, accounts, app stores, monetisation. Other sports only as specified in this file (Badminton is next; its spec will be added as its own section).
Keep the architecture open for adding badminton or tennis later: the lobby, phone controller and characters should be reusable.

## 12. Cube World hub (game-selection lobby)

The lobby becomes a big floating "planet" shaped like a **cube**: the hub of the whole game collection.
Each of the six faces is a small world for one game. For now only the **Minigolf** face is playable; the other faces are teasers.

**Look and feel**
- A chunky cube with soft rounded edges, floating in a dreamy sky (also try a starry space version and let the user pick), idling with a slow gentle rotation/bob.
- Each face is a little diorama. **Minigolf face:** the same look as our minigolf (tiny islands in a cute sea, flags, windmill, trees).
- Other faces: intentional, appealing "under construction" dioramas (scaffolding, cones, crates, a big glowing "?", soft fog). One of them hints at **Badminton** (the next game: a net and a shuttlecock under a tarp).
- Players' chibi characters appear on the cube as they join (name and colour), wave when they arrive and idle around.
- QR code and room code stay visible in a UI panel, as now.
- Same art style as the games: soft light, bloom, toon-ish materials, lots of juice (pop-in, sparkles, smooth easing).

**Interaction**
- Choose a game from the host (arrow keys + Enter, or click a face) or from the first player's phone (swipe left/right to rotate the cube, tap "Play").
- The cube rotates smoothly to the chosen face and shows its title (e.g. "Minigolf"), a one-line description and the player count. Locked faces show "Coming soon".
- Start: the camera dives into the face and transitions (zoom/fade) into the game. After a match, "Back to Cube" returns to the hub with the last game's face in front.
- Phones show the lobby state: which game is selected and who has joined.

**Architecture**
- Add a small **game registry**: each game is a module with id, title, face diorama builder, min/max players, phone controller mode, host scene and server match logic. Minigolf is the first entry.
- Make adding Badminton easy: the lobby, seats, phone connection, characters, handedness and sensitivity are shared by all games.
- The hub must stay light: 60 fps on the MacBook Air.

**Process**
- Do this after the open Phase 4b step (the user's feedback on the trees). It may come before 4c.
- Before building it fully, show the user 2–3 visual concept options (quick renders/screenshots in the browser) and let them choose. The user gives visual direction with reference images.
- Done when: players join on the cube, pick Minigolf from the cube, play a match and return to the cube; the locked faces look intentional and inviting.

## 13. Badminton (next game) — DRAFT, still being designed with the user

Status: decisions so far are recorded here. Do not start building Badminton until the user says so (Cube World hub and the Minigolf phases come first). Open questions are marked **OPEN**.

**Decided**
- **Automatic movement:** characters run to the shuttle on their own (like classic motion-control tennis games). The player only swings the phone. There is no manual movement control.
- **Split screen:** the screen splits vertically into a left and a right half. Each side gets its own camera from behind its own character, so the shuttle flies towards the player. 1v1: one half per player. 2v2: one half per team (both teammates visible). 1 player vs CPU: full screen.
- Keep the badminton scene lighter than minigolf, because split screen renders the scene twice. Target 60 fps on the MacBook Air.
- Reuse everything shared: Cube World lobby, phone connection, seats, chibi characters, handedness and per-player swing sensitivity.
- **Setting: a beach.** Sand court with a net, palm trees, gentle waves rolling in, sunny sky — a cousin of the minigolf islands, same soft art style. This is the only venue for now.
- **Later (not now):** choose the venue in the game menu. Ideas the user liked: a court on a cloud high above the sea, a cosy gym with a wooden floor and a stand of cute spectators, a backyard with the net strung between two trees at sunset. Keep venue-specific code separate so more venues can be added later.

**Proposed (user agreed in principle, details to tune)**
- Modes: 1v1, 2v2 and 1 player vs CPU (CPU difficulty levels).
- ~~Shot type comes from the swing~~ (replaced, see Decided: shot type from court position). Power comes from the swing speed. ~~Hitting early/late sends the shuttle left/right~~ (replaced: the swing direction aims, see Decided).
- Short party matches: rally scoring to 11 points.
- The shuttle is slow, so Wi-Fi delay matters less than in tennis. Badminton needs **instant** swing detection, unlike minigolf's "wait until still" flow. Use a generous, tunable hit window and compensate for network delay (timestamps).

- **Shot type comes from the court position, not from the phone (user, 2026-10-30, after Swing Lab test 2 showed the phone cannot tell overhead from underhand reliably):** a character at the back of the court plays overhead; a character at the front plays underhand, unless a smash is possible (shuttle high enough near the net). The phone only gives: a swing happened, its power and its exact time.
- **Aiming (user, 2026-10-30):** the direction of the swing aims: swinging more to the left sends the shuttle left, more to the right sends it right. Timing only decides whether the shuttle is hit and how well (a "Perfect" hit is faster and more precise); a swing too early or too late misses. (Measured on the phone as the turn around the vertical axis during the swing, so it works for any grip and either hand.)
- **Shot depth (user, 2026-10-30):** for now every shot flies to the back of the court. Later the phone gets a big button that means "play a short shot" (drop).

**OPEN**
- Exact swing-to-shot mapping, after testing on real phones.

**Phase plan (when the user starts Badminton)**
- B1: swing-type detection prototype on real phones (overhead vs underhand, swing speed, timing). Highest risk, do first.
- B2: graybox rally vs CPU with automatic movement and the hit window.
- B3: split screen 1v1, scoring to 11.
- B4: 2v2.
- B5: art and juice, plus the Badminton face on the Cube World hub.
