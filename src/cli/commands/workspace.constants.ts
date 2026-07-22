// Un único subcomando hoy (classify) — mismo patrón que backup.constants.ts
// (STATE_SUBCOMMAND), deja espacio para crecer sin romper la forma del CLI.
export const WORKSPACE_SUBCOMMAND = {
  CLASSIFY: 'classify',
} as const;

export const WORKSPACE_USAGE = 'Usage: sv-playbook workspace classify [--json]';
