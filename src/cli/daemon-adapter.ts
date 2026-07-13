import { main } from './main.js';
import type { CommandExecutionPort } from '../daemon/daemon.types.js';

export function createCliCommandExecutionPort(): CommandExecutionPort {
  return {
    async execute(req) {
      const outLines: string[] = [];
      const errLines: string[] = [];
      const exitCode = await main(req.argv.slice(), {
        out: (l) => outLines.push(l),
        err: (l) => errLines.push(l),
      });
      const trail = (a: string[]): string => a.join('\n') + (a.length > 0 ? '\n' : '');
      return { exitCode, stdout: trail(outLines), stderr: trail(errLines) };
    },
  };
}
