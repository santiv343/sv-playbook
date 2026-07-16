export const PR_STATE = { OPEN: 'OPEN', MERGED: 'MERGED', CLOSED: 'CLOSED' } as const;
export const PR_MERGE_STATE = {
  BEHIND: 'BEHIND',
  CLEAN: 'CLEAN',
  DIRTY: 'DIRTY',
  BLOCKED: 'BLOCKED',
  UNKNOWN: 'UNKNOWN',
} as const;
export const RECONCILE_SAFETY = { SAFE: 'safe', UNSAFE: 'unsafe' } as const;
export const RECONCILE_COMMAND = { BACKUP: 'backup' } as const;
export const RECONCILER_ACTOR = 'reconciler';
export const GITHUB_FIELD = { MERGE_STATE_STATUS: 'mergeStateStatus', STATE: 'state' } as const;
export const RECONCILE_DRIVER_METHOD = { UPDATE_BRANCH: 'updateBranch', TASK_CLOSE: 'taskClose' } as const;
export const RECONCILE_COMMAND_PREFIX = {
  UPDATE_BRANCH: 'gh pr update-branch',
  TASK_CLOSE: 'task close',
} as const;
