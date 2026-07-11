import { request as httpRequest } from 'node:http';
import type { DaemonExecResponse } from './daemon.types.js';

export function forwardToDaemon(argv: string[], token: string, port: number): Promise<number> {
  return new Promise((resolve) => {
    const body = JSON.stringify({ token, argv });
    const bodyBuf = Buffer.from(body, 'utf8');
    const req = httpRequest(
      {
        hostname: '127.0.0.1',
        port,
        method: 'POST',
        path: '/api/v1/exec',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': bodyBuf.length,
        },
      },
      (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => { data += chunk; });
        res.on('end', () => {
          const parsed = parseDaemonResponse(data);
          if (parsed === null) { resolve(3); return; }
          if (parsed.stdout) process.stdout.write(parsed.stdout);
          if (parsed.stderr) process.stderr.write(parsed.stderr);
          resolve(parsed.exitCode);
        });
      },
    );
    req.on('error', () => { resolve(3); });
    req.write(bodyBuf);
    req.end();
  });
}

function getProp(obj: unknown, key: string): unknown {
  if (typeof obj !== 'object' || obj === null) return undefined;
  return Reflect.get(obj, key);
}

function parseDaemonResponse(data: string): DaemonExecResponse | null {
  try {
    const parsed: unknown = JSON.parse(data);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const exitCode: unknown = getProp(parsed, 'exitCode');
    const stdout: unknown = getProp(parsed, 'stdout');
    const stderr: unknown = getProp(parsed, 'stderr');
    const daemonVersion: unknown = getProp(parsed, 'daemonVersion');
    return {
      exitCode: typeof exitCode === 'number' ? exitCode : 3,
      stdout: typeof stdout === 'string' ? stdout : '',
      stderr: typeof stderr === 'string' ? stderr : '',
      daemonVersion: typeof daemonVersion === 'string' ? daemonVersion : '',
    };
  } catch {
    return null;
  }
}
