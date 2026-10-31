import { appendFile, mkdir } from 'node:fs/promises';
import { createServer } from 'node:https';
import QRCode from 'qrcode';
import { createServer as createViteServer } from 'vite';
import { WebSocketServer, type WebSocket } from 'ws';
import { WS_PATH, type ClientMessage } from '../shared/protocol.ts';
import { TUNING } from '../shared/tuning.ts';
import { ensureCertificate } from './cert.ts';
import { Lobby, makeRoomCode } from './lobby.ts';
import { getLanAddresses } from './network.ts';

const PORT = Number(process.env.PORT ?? 8443);

const lanAddresses = getLanAddresses();
const { key, cert } = await ensureCertificate(lanAddresses);
const server = createServer({ key, cert });

// Vite serves the host and controller pages and reloads them when code changes.
const vite = await createViteServer({
  server: { middlewareMode: true, hmr: { server } },
});

// Friendly URLs: "/" is the big screen, "/play" is the phone controller.
const PAGES: Record<string, string> = {
  '/': '/host/index.html',
  '/play': '/controller/index.html',
};

server.on('request', (req, res) => {
  const url = new URL(req.url ?? '/', 'https://localhost');
  const page = PAGES[url.pathname];
  if (page) req.url = page + url.search;
  vite.middlewares(req, res);
});

// Every game gets a room code, so an old phone tab cannot join the wrong game.
const room = makeRoomCode();
const joinUrl = lanAddresses.length > 0 ? `https://${lanAddresses[0]}:${PORT}/play?room=${room}` : null;
const qrDataUrl = joinUrl ? await QRCode.toDataURL(joinUrl, { margin: 1, width: 512 }) : null;
const lobby = new Lobby(room, { type: 'host_info', room, joinUrl, qrDataUrl });

// Badminton Swing Lab: every swing is saved (one JSON line each) for tuning the detection.
const SWING_LOG = 'logs/badminton-swings.jsonl';
lobby.onBadmintonSwing = (entry) => {
  void mkdir('logs', { recursive: true })
    .then(() => appendFile(SWING_LOG, JSON.stringify(entry) + '\n'))
    .catch((err) => console.error('Could not save the swing log:', err));
};
// How the game judged each swing in a match (timing offset, the coach's corrections, the verdict).
const OUTCOME_LOG = 'logs/badminton-outcomes.jsonl';
lobby.onBadmintonOutcome = (entry) => {
  void mkdir('logs', { recursive: true })
    .then(() => appendFile(OUTCOME_LOG, JSON.stringify(entry) + '\n'))
    .catch((err) => console.error('Could not save the outcome log:', err));
};

// WebSocket hub. Vite has its own WebSocket for reloading, so only take ours.
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  if (new URL(req.url ?? '/', 'https://localhost').pathname !== WS_PATH) return;
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
});

const alive = new WeakMap<WebSocket, boolean>();

wss.on('connection', (ws) => {
  alive.set(ws, true);
  ws.on('pong', () => alive.set(ws, true));
  ws.on('message', (data) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(String(data));
    } catch {
      return;
    }
    lobby.handle(ws, msg);
  });
  ws.on('close', () => lobby.handleClose(ws));
});

// A locked phone often disappears without saying goodbye. Ping everyone
// regularly and drop the ones that did not answer the previous ping.
setInterval(() => {
  for (const ws of wss.clients) {
    if (!alive.get(ws)) {
      ws.terminate();
      continue;
    }
    alive.set(ws, false);
    ws.ping();
  }
}, TUNING.network.heartbeatIntervalMs);

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Is the game already running in another window?`);
  } else {
    console.error(err);
  }
  process.exit(1);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('\nMinigolf Party is running!\n');
  console.log(`  Big screen (open on this Mac):  https://localhost:${PORT}/`);
  if (lanAddresses.length === 0) {
    console.log('  No Wi-Fi network found, so phones cannot connect. Join a Wi-Fi network and restart.');
  }
  if (joinUrl) {
    console.log(`  Phones (or scan the QR code):   ${joinUrl}`);
  }
  console.log(`  Room code:                      ${room}`);
  console.log('\nPress Ctrl+C to stop.\n');
});
