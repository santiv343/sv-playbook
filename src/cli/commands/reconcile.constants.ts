// ACTION_SAFE/UNSAFE clasifican cada ReconcilerRow (reconcile.types.ts) por
// cuán reversible es — safe se puede ejecutar automáticamente con
// `--apply`, unsafe queda para confirmación humana explícita.
export const RECONCILE_USAGE = 'Usage: sv-playbook reconcile [--apply] [--json]';

export const ACTION_SAFE = 'safe';
export const ACTION_UNSAFE = 'unsafe';
