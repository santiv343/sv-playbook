export const PREFLIGHT_VERIFY_TIMEOUT_MS = 120_000;
export const PREFLIGHT_VERIFY_OUTPUT_TAIL_CHARACTERS = 4_096;

export const PREFLIGHT_VERIFY_EXIT_CODE = {
  SUCCESS: 0,
} as const;

export const PREFLIGHT_VERIFY_DETAIL = {
  DIRTY_WORKTREE: 'worktree must be clean before verification',
  SPAWN_FAILED: 'could not start configured verification command',
  STATUS_UNAVAILABLE: 'could not inspect worktree before verification',
} as const;
