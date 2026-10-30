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
- The self-signed certificate is created in `certs/` (not in git); delete that folder to force a new one.
- Tuning values: `shared/tuning.ts`. WebSocket messages: `shared/protocol.ts`.
