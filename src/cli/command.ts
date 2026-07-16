import { CONFIRM_DESTRUCTIVE_FLAG } from './command.constants.js';

export function extractConfirmDestructive(args: readonly string[]): { args: string[]; hasConfirm: boolean } {
  const hasConfirm = args.includes(CONFIRM_DESTRUCTIVE_FLAG);
  return {
    args: hasConfirm ? args.filter((a) => a !== CONFIRM_DESTRUCTIVE_FLAG) : [...args],
    hasConfirm,
  };
}
