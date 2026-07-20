// PREFLIGHT_PHASE es la secuencia real que un candidato atraviesa antes de
// llegar a review (worktree limpio -> config cargada -> preparación ->
// verify -> cleanup) — cada fase tiene su propio PREFLIGHT_FAILURE_CODE
// específico, así un fallo en "preparation" nunca se confunde con un fallo
// en "verification" real, aunque ambos terminen en el mismo status FAIL.
export const PREFLIGHT_VERIFY_OUTPUT_TAIL_CHARACTERS = 4_096;
export const LEGACY_REVIEW_VERIFY_TIMEOUT_MS = 120_000;

export const PREFLIGHT_VERIFY_EXIT_CODE = {
  SUCCESS: 0,
} as const;

export const PREFLIGHT_VERIFY_DETAIL = {
  DIRTY_WORKTREE: 'worktree must be clean before verification',
  SPAWN_FAILED: 'could not start configured verification command',
  STATUS_UNAVAILABLE: 'could not inspect worktree before verification',
} as const;

export const PREFLIGHT_PHASE = {
  WORKTREE: 'worktree',
  CONFIGURATION: 'configuration',
  PREPARATION: 'preparation',
  VERIFICATION: 'verification',
  CLEANUP: 'cleanup',
} as const;

export const PREFLIGHT_FAILURE_CODE = {
  PREPARATION_FAILED: 'PREFLIGHT_PREPARATION_FAILED',
  VERIFICATION_FAILED: 'PREFLIGHT_VERIFICATION_FAILED',
  INACTIVITY_TIMEOUT: 'PREFLIGHT_INACTIVITY_TIMEOUT',
  SPAWN_FAILED: 'PREFLIGHT_SPAWN_FAILED',
  SYSTEM_FAILED: 'PREFLIGHT_SYSTEM_FAILED',
  DIRTY_WORKTREE: 'PREFLIGHT_DIRTY_WORKTREE',
  WORKTREE_CREATE_FAILED: 'PREFLIGHT_WORKTREE_CREATE_FAILED',
  CLEANUP_FAILED: 'PREFLIGHT_CLEANUP_FAILED',
} as const;

export const PREFLIGHT_CLEAN_WORKTREE_KIND = 'detached-git-worktree';

export const PREFLIGHT_PHASE_DETAIL = {
  COMMAND_NOT_CONFIGURED: 'command not configured',
  CONFIGURATION_LOADED: 'preflight configuration loaded',
  UPSTREAM_PHASE_FAILED: 'upstream phase failed',
  WORKTREE_CREATED: 'detached candidate worktree created',
  WORKTREE_REMOVED: 'detached candidate worktree removed',
} as const;
