import { spawn, type ChildProcess } from 'node:child_process';
import {
  NODE_ERROR_PROPERTY,
  OS_PLATFORM,
  PROCESS_EVENT,
  PROCESS_SIGNAL,
  PROCESS_STDIO,
  WINDOWS_PROCESS_TREE_ARGUMENT,
  WINDOWS_PROCESS_TREE_COMMAND,
} from './platform.constants.js';

export function nodeErrorCode(error: unknown): unknown {
  if (typeof error !== 'object' || error === null || !Reflect.has(error, NODE_ERROR_PROPERTY.CODE)) {
    return undefined;
  }
  return Reflect.get(error, NODE_ERROR_PROPERTY.CODE);
}

// En POSIX, `detached: true` pone al hijo en su propio process group, así
// `process.kill(-pid, ...)` mata todo el árbol de una. Windows no tiene ese
// concepto — por eso detachProcessTree() es false ahí y terminateProcessTree
// usa taskkill /T (tree) como sustituto en terminateWindowsProcessTree.
export function detachProcessTree(): boolean {
  return process.platform !== OS_PLATFORM.WINDOWS;
}

function terminateWindowsProcessTree(child: ChildProcess): void {
  if (child.pid === undefined) {
    child.kill(PROCESS_SIGNAL.FORCE);
    return;
  }
  const killer = spawn(WINDOWS_PROCESS_TREE_COMMAND, [
    WINDOWS_PROCESS_TREE_ARGUMENT.PID,
    String(child.pid),
    WINDOWS_PROCESS_TREE_ARGUMENT.TREE,
    WINDOWS_PROCESS_TREE_ARGUMENT.FORCE,
  ], { stdio: PROCESS_STDIO.IGNORE, windowsHide: true });
  killer.once(PROCESS_EVENT.ERROR, () => { child.kill(PROCESS_SIGNAL.FORCE); });
}

export function terminateProcessTree(child: ChildProcess): void {
  if (process.platform === OS_PLATFORM.WINDOWS) {
    terminateWindowsProcessTree(child);
    return;
  }
  if (child.pid === undefined) {
    child.kill(PROCESS_SIGNAL.FORCE);
    return;
  }
  try {
    process.kill(-child.pid, PROCESS_SIGNAL.FORCE);
  } catch {
    child.kill(PROCESS_SIGNAL.FORCE);
  }
}
