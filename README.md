# Minigolf Party (working title)

A cosy party minigolf game. The game runs in a browser on the Mac (optionally on a TV),
and every player uses their own phone as the putter. See `SPEC.md` for the full plan.

## Start

Needs Node.js 24 or newer.

```bash
npm install      # first time only
npm run dev      # starts everything and prints the URLs
```

- **Big screen:** open `https://localhost:8443/` in Chrome or Safari on the Mac.
- **Phone:** scan the QR code on the big screen (or open the printed `https://<mac-ip>:8443/play?room=<code>` address).

Every start creates a new room code, so phones need to scan the new QR code after a restart.

The phone and the Mac must be on the same Wi-Fi.

## One-time steps for the security warning

The game uses its own local HTTPS certificate (phones only allow motion sensors on HTTPS pages),
so browsers show a warning the first time:

- **Mac, Chrome:** click "Advanced" → "Proceed to localhost (unsafe)".
- **Mac, Safari:** click "Show Details" → "visit this website" → confirm.
- **iPhone, Safari:** tap "Show Details" → "visit this website" → "Visit Website".
- **Android, Chrome:** tap "Advanced" → "Proceed to … (unsafe)".
- **macOS firewall:** if the Mac asks whether "node" may accept incoming connections, click "Allow".

A new certificate (and so the warning once more) appears only when the Mac gets a different network address.

## Project layout

- `server/` – Node.js HTTPS server, WebSocket hub, certificate creation
- `host/` – the Three.js game on the big screen
- `controller/` – the phone controller page
- `shared/` – code used by all parts: message types (`protocol.ts`) and all tuning values (`tuning.ts`)

## Checks

```bash
npm run check    # TypeScript type check
```

## Credits

- Windmill and flag: [Minigolf Kit](https://kenney.nl/assets/minigolf-kit) by Kenney (CC0), in `host/assets/minigolf/`.
- Grass texture: [Grass 004](https://ambientcg.com/view?id=Grass004) from ambientCG (CC0), in `host/assets/textures/`.
- Trees, bushes and grass tufts: [KayKit Forest Nature Pack](https://kaylousberg.itch.io/kaykit-forest) by Kay Lousberg (CC0, www.kaylousberg.com), in `host/assets/forest/`.
