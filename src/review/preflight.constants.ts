export const PREFLIGHT_VERIFY_TIMEOUT_MS = 120_000;

export const PREFLIGHT_VERIFY_DETAIL = {
  DIRTY_WORKTREE: 'worktree must be clean before verification',
  STATUS_UNAVAILABLE: 'could not inspect worktree before verification',
} as const;
