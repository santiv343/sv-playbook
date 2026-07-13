import { spawnSync } from 'node:child_process';

// Child-process deadline — safety net against truly hung daemons without
// cutting off legitimate long commands (e.g. verify takes 25s+).
const FORWARD_DEADLINE_MS = 600000;

// How long to wait for the TCP connection to the daemon before failing fast.
const CONNECT_TIMEOUT_MS = 5000;

// The forwarding transport runs in a child node process so it can be awaited
// synchronously from module-load code (store.ts tryAutoForward). The child
// POSTs the argv to the daemon, mirrors stdout/stderr, and exits with the
// daemon-reported exit code (1 on any transport/parse failure).
function buildForwardScript(body: string, port: number): string {
  const bl = Buffer.byteLength(body);
  return `const http=require('http');const b=${JSON.stringify(body)};const r=http.request({hostname:'127.0.0.1',port:${port},method:'POST',path:'/api/v1/exec',headers:{'Content-Type':'application/json','Content-Length':${bl}}},s=>{let d='';s.setEncoding('utf8');s.on('data',c=>{d+=c;});s.on('end',()=>{try{const p=JSON.parse(d);if(p.stdout)process.stdout.write(p.stdout);if(p.stderr)process.stderr.write(p.stderr);process.exit(typeof p.exitCode==='number'?p.exitCode:1);}catch{process.exit(1);}});});const ct=setTimeout(()=>{r.destroy();process.exit(1);},${CONNECT_TIMEOUT_MS});r.on('socket',s=>{s.on('connect',()=>clearTimeout(ct));});r.on('error',()=>{clearTimeout(ct);process.exit(1);});r.end(b);`;
}

// Single forwarding transport — used by production (store.ts auto-forward)
// and exercised directly by the daemon tests.
export function forwardToDaemonSync(argv: string[], token: string, port: number): number {
  const body = JSON.stringify({ token, argv });
  const result = spawnSync(process.execPath, ['-e', buildForwardScript(body, port)], {
    stdio: ['ignore', 'inherit', 'inherit'],
    timeout: FORWARD_DEADLINE_MS,
  });
  return typeof result.status === 'number' ? result.status : 1;
}
