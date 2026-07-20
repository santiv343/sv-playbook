import { CONFIRM_DESTRUCTIVE_FLAG } from './command.constants.js';

// El flag `--confirm-destructive` se extrae ACÁ, antes de que el comando
// vea sus propios argumentos — así ningún comando individual necesita
// saber parsear esa flag, y destructive-gate.ts puede consultar
// `hasConfirm` de forma uniforme para cualquier Command marcado
// `destructive: true` (ver restore.ts).
export function extractConfirmDestructive(args: readonly string[]): { args: string[]; hasConfirm: boolean } {
  const hasConfirm = args.includes(CONFIRM_DESTRUCTIVE_FLAG);
  return {
    args: hasConfirm ? args.filter((a) => a !== CONFIRM_DESTRUCTIVE_FLAG) : [...args],
    hasConfirm,
  };
}
