import { mkdirSync, openSync, closeSync, writeSync, unlinkSync } from 'node:fs';
import type { DaemonFilesystemPort } from '../daemon.types.js';

export function createNodeDaemonFileSystem(): DaemonFilesystemPort {
  return {
    mkdir(dir, options) {
      mkdirSync(dir, options);
    },
    writeFileAtomic(path, content, mode) {
      const fd = openSync(path, 'wx', mode ?? 0o600);
      try { writeSync(fd, content); } finally { closeSync(fd); }
    },
    unlink(path) {
      try { unlinkSync(path); } catch { /* best-effort */ }
    },
  };
}
