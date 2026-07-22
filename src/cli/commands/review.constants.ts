// `review preflight` es la única puerta CLI a runPreflight (review/preflight.ts)
// — permite correr el preflight manualmente contra un packet sin pasar por
// el flujo completo de review-candidate.
export const REVIEW_PREFLIGHT_USAGE = 'sv-playbook review preflight <ID> [--pr <n>] [--json]';
export const REVIEW_CMD_NAME = 'review';

