# Projekt-sport — project instructions

Read SPEC.md before starting any work. It is the source of truth for what we are building.

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
- Game (host): `host/game/Game.ts` (rules, camera, aim line), `host/game/course.ts` (the 3 holes: smooth rounded lanes built from a curve, turf bumpers, cup pit, Kenney windmill and flag), `host/game/ball.ts` (ball physics), `host/game/preview.ts` (distance estimate for the aim line), `host/game/character.ts` (chibi characters and their animations), `host/game/scenery.ts` (sky with sun, clouds, sea shader, islands). Mac keys: Enter starts the game / next hole / plays again, Esc goes back to the lobby; in the game arrows aim, hold P for a practice swing, hold Space to hit (for the current player). In dev mode `window.game` is available in the browser console.
