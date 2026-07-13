import { parseArgs } from 'node:util';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { EXIT } from '../command.constants.js';
import type { Command } from '../command.types.js';
import { commonRoot, openStore } from '../../db/store.js';
import { readBoardStatus } from '../../status/status.js';
import { getCwd } from '../../runtime/context.js';

const USAGE = 'Usage: sv-playbook serve [--port <N>]';
const DEFAULT_PORT = 3131;

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>sv-playbook board</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,sans-serif;background:#111;color:#e0e0e0;padding:2rem;max-width:960px;margin:0 auto}
h1{font-size:1.25rem;margin-bottom:1rem}
.counts{display:flex;gap:.75rem;flex-wrap:wrap;margin-bottom:1.5rem}
.counts span{background:#1a1a2e;padding:.3rem .7rem;border-radius:4px;font-size:.85rem}
table{border-collapse:collapse;width:100%;font-size:.85rem}
th,td{text-align:left;padding:.4rem .5rem;border-bottom:1px solid #222}
th{color:#888;font-weight:600}
td{vertical-align:top}
.lease-stale{color:#f88}
.lease-fresh{color:#8f8}
.lease-none{color:#666}
.footer{margin-top:1.5rem;font-size:.8rem;color:#666}
.refresh{color:#555}
</style>
</head>
<body>
<h1>sv-playbook board</h1>
<div id="counts" class="counts"></div>
<table>
<thead><tr><th>ID</th><th>Title</th><th>Status</th><th>Lease</th><th>Last Event</th></tr></thead>
<tbody id="rows"></tbody>
</table>
<div id="footer" class="footer"></div>
<div class="refresh">Auto-refresh every 3s</div>
<script>
const ORDER=['active','review','ready','draft','blocked','done','dropped'];
async function load(){try{const r=await fetch('/api/board');const b=await r.json();
document.getElementById('counts').innerHTML=ORDER.filter(s=>b.counts[s]!=null).map(s=>\`<span>\${b.counts[s]} \${s}</span>\`).join('');
const rows=document.getElementById('rows');
rows.innerHTML=b.packets.map(p=>{
let lease='<span class="lease-none">no lease</span>';
if(p.lease)lease=p.lease.stale?'<span class="lease-stale">stale '+p.lease.sessionId+'</span>':'<span class="lease-fresh">'+p.lease.sessionId+'</span>';
let ev='—';
if(p.lastEvent)ev=p.lastEvent.command+' '+p.lastEvent.detail;
return\`<tr><td>\${p.id}</td><td>\${p.title}</td><td>\${p.status}</td><td>\${lease}</td><td>\${ev}</td></tr>\`;
}).join('');
const live=p.packets.filter(x=>x.lease&&!x.lease.stale).length;
const total=p.packets.filter(x=>x.lease).length;
document.getElementById('footer').innerHTML='backup: '+(p.backup.ageHours!=null?p.backup.ageHours.toFixed(1)+' hours old':'none')+' — '+live+'/'+total+' leases live';
}catch(e){document.getElementById('counts').innerHTML='<span>connection lost</span>';}}
load();setInterval(load,3000);
</script>
</body>
</html>`;

function jsonResponse(res: ServerResponse, body: unknown): void {
  res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(body));
}

function htmlResponse(res: ServerResponse): void {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(HTML);
}

function notFound(res: ServerResponse): void {
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
}

function handleRequest(repoRoot: string, storeFactory: () => { store: ReturnType<typeof openStore> }, req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

  if (req.method === 'GET' && url.pathname === '/') {
    htmlResponse(res);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/board') {
    const store = storeFactory().store;
    try {
      const board = readBoardStatus(store, repoRoot);
      jsonResponse(res, board);
    } finally {
      store.close();
    }
    return;
  }

  notFound(res);
}

export const command: Command = {
  name: 'serve',
  summary: 'Start a local read-only web view of the board',
  run(args, io): Promise<number> {
    const parsed = parseArgs({
      args,
      allowPositionals: true,
      options: { port: { type: 'string', short: 'p' } },
    });
    if (parsed.positionals.length > 0) {
      io.err(USAGE);
      return Promise.resolve(EXIT.USAGE);
    }
    const port = Number(parsed.values.port ?? DEFAULT_PORT);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      io.err(`Invalid port: ${parsed.values.port}`);
      return Promise.resolve(EXIT.USAGE);
    }

    return new Promise((resolve) => {
      const repoRoot = commonRoot(getCwd());
      const storeFactory = () => ({ store: openStore(repoRoot) });

      const server = createServer((req, res) => { handleRequest(repoRoot, storeFactory, req, res); });

      server.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          io.err(`Port ${port} is already in use`);
          resolve(EXIT.SYSTEM);
        } else {
          io.err(`Server error: ${err.message}`);
          resolve(EXIT.SYSTEM);
        }
      });

      server.listen(port, () => {
        io.out(`Board server listening on http://localhost:${port}`);
      });
    });
  },
};
