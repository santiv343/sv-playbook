import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { DAEMON_CONNECT_TIMEOUT_MS_DEFAULT } from './daemon.constants.js';
import { SESSION_FILE_NAME } from '../tasks/service.constants.js';

function buildForwardScript(body: string, port: number): string {
  const bl = Buffer.byteLength(body);
  return `const http=require('http');const b=${JSON.stringify(body)};const r=http.request({hostname:'127.0.0.1',port:${port},method:'POST',path:'/api/v1/exec',headers:{'Content-Type':'application/json','Content-Length':${bl}}},s=>{let d='';s.setEncoding('utf8');s.on('data',c=>{d+=c;});s.on('end',()=>{try{const p=JSON.parse(d);if(p.stdout)process.stdout.write(p.stdout);if(p.stderr)process.stderr.write(p.stderr);process.exit(typeof p.exitCode==='number'?p.exitCode:1);}catch{process.exit(1);}});});const ct=setTimeout(()=>{r.destroy();process.exit(1);},${DAEMON_CONNECT_TIMEOUT_MS_DEFAULT});r.on('socket',s=>{s.on('connect',()=>clearTimeout(ct));});r.on('error',()=>{clearTimeout(ct);process.exit(1);});r.end(b);`;
}

function readSessionId(cwd: string): string | null {
  try {
    const sessionPath = join(cwd, SESSION_FILE_NAME);
    if (!existsSync(sessionPath)) return null;
    const content = readFileSync(sessionPath, 'utf8').trim();
    return content.length > 0 ? content : null;
  } catch {
    return null;
  }
}

export function forwardToDaemonSync(argv: string[], token: string, port: number, sessionId: string | null = null): number {
  const cwd = process.cwd();
  if (sessionId === null) sessionId = readSessionId(cwd);
  const body = JSON.stringify({ token, argv, context: { cwd, sessionId } });
  const result = spawnSync(process.execPath, ['-e', buildForwardScript(body, port)], {
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  return typeof result.status === 'number' ? result.status : 1;
}
