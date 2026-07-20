// STATE_SUBCOMMAND es el único subcomando real hoy (`backup state`) —
// existe como subcomando en vez de ser el comando entero pensando en
// crecimiento futuro (otros tipos de backup).
export const BACKUP_USAGE = 'Usage: sv-playbook backup state [--force]';
export const RESTORE_USAGE = 'Usage: sv-playbook restore state --file <path> [--force]';
export const STATE_SUBCOMMAND = 'state';
