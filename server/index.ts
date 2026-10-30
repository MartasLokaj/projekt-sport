import { createServer } from 'node:https';
import { createServer as createViteServer } from 'vite';
import { WebSocketServer, type WebSocket } from 'ws';
import { WS_PATH, type ClientMessage, type ClientRole, type ServerMessage } from '../shared/protocol.ts';
import { ensureCertificate } from './cert.ts';
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

// WebSocket hub. Vite has its own WebSocket for reloading, so only take ours.
const wss = new WebSocketServer({ noServer: true });
const roles = new Map<WebSocket, ClientRole>();

server.on('upgrade', (req, socket, head) => {
  if (new URL(req.url ?? '/', 'https://localhost').pathname !== WS_PATH) return;
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
});

wss.on('connection', (ws) => {
  ws.on('message', (data) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(String(data));
    } catch {
      return;
    }
    if (msg.type === 'hello' && (msg.role === 'host' || msg.role === 'controller')) {
      roles.set(ws, msg.role);
      broadcastStatus();
    }
  });
  ws.on('close', () => {
    roles.delete(ws);
    broadcastStatus();
  });
});

function broadcastStatus(): void {
  const roleList = [...roles.values()];
  const msg: ServerMessage = {
    type: 'status',
    hosts: roleList.filter((r) => r === 'host').length,
    controllers: roleList.filter((r) => r === 'controller').length,
  };
  const text = JSON.stringify(msg);
  for (const client of roles.keys()) client.send(text);
}

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
  for (const address of lanAddresses) {
    console.log(`  Phone controller:               https://${address}:${PORT}/play`);
  }
  console.log('\nPress Ctrl+C to stop.\n');
});
