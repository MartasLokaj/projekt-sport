# Projekt-sport — project instructions

Read SPEC.md before starting any work. It is the source of truth for what we are building.
Then read progress/STATUS.md: where the project is, what the user decided, and what to do next. Keep it up to date after each milestone.

## Working with the user
- The user is not a programmer. Talk to them in Czech, in plain words. Explain any technical term in one short sentence.
- All code, comments, file names, commit messages and every piece of in-game text are in English.
- Plan before editing: read the relevant files, propose the smallest change that proves the feature, list the files you will touch, and wait for the user's OK before larger changes.
- Work strictly phase by phase (see SPEC.md, section 10). Do not start the next phase until the user has tested the current one on real phones and approved it.
- After every change, tell the user exactly how to test it: what to open on the Mac, what to do on the phone, and what they should see.
- Commit to git after each working milestone with a clear message, so we can always go back to a version that worked.
- Before installing any third-party skill, plugin or package that runs scripts, read it, summarise for the user what it does, and ask first.
- Keep all tuning values (swing power curve, ball friction, camera speeds…) in one clearly named config file so they are easy to tweak.

## Commands
- `npm install` – install packages (first time only).
- `npm run dev` – starts everything (HTTPS server + Vite + WebSocket hub on port 8443) and prints the URLs. Big screen: `https://localhost:8443/`, phone: `https://<lan-ip>:8443/play`.
- `npm run check` – TypeScript type check.
- Page code (host/, controller/) reloads by itself. Server code (server/) needs a restart: Ctrl+C, then `npm run dev`. Every restart makes a new room code.
- The self-signed certificate is created in `certs/` (not in git); delete that folder to force a new one.
- Server: `server/lobby.ts` (seats, room code, message routing), `server/match.ts` (turns, strokes, scores).
- Tuning values: `shared/tuning.ts` (aim, swing detection, ball curve, scenery and look, gauge, slingshot). WebSocket messages: `shared/protocol.ts`. Swing detection logic: `controller/swing.ts`.
- Lobby (host): Cube World hub — `host/hub/Hub.ts` (cube scene, turning, characters and name tags), `host/hub/faces.ts` (the games on the cube's sides and their little worlds). In the lobby: drag the cube with the mouse to spin it, scroll or pinch to zoom, click a side (or ← →) to choose that game, Enter plays it, Esc lets go.
- Game (host): `host/game/Game.ts` (rules, camera, aim line), `host/game/course.ts` (the 3 holes: smooth rounded lanes built from a curve, turf bumpers, cup pit, Kenney windmill and flag), `host/game/ball.ts` (ball physics), `host/game/preview.ts` (distance estimate for the aim line), `host/game/character.ts` (chibi characters and their animations), `host/game/scenery.ts` (sky with sun, clouds, sea shader, islands). Mac keys: Enter starts the game / next hole / plays again, Esc goes back to the lobby; in the game arrows aim, hold P for a practice swing, hold Space to hit (for the current player). In dev mode `window.game` is available in the browser console.
- Badminton (phases B2–B3): Badminton side of the cube → Enter. One phone = vs CPU, two phones = split screen 1v1 (Mac: Space swings for player 1, hold ← → to aim; ↑ swings for player 2). Code in `host/badminton/` (`Badminton.ts` rules/CPU/camera, `shuttle.ts` flight curves, `court.ts` the venue), tuning `TUNING.badminton`. In dev mode `window.badminton` is the game.
- Badminton Swing Lab (phase B1): `L` in the lobby opens it on the big screen; phones switch to the badminton swing screen. Detection: `controller/badminton/swing.ts`, phone screen `controller/badminton/lab.ts`, big screen `host/lab/Lab.ts`, tuning `TUNING.badmintonSwing` / `TUNING.badmintonLab`. Every swing is saved to `logs/badminton-swings.jsonl` (not in git) for tuning.
