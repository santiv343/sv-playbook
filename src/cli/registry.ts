import type { Command } from './command.types.js';
import { docsCommand } from './commands/docs.js';
import { taskCommand } from './commands/task.js';
import { describeCommand } from './commands/describe.js';
import { doctorCommand } from './commands/doctor.js';
import { backupCommand, restoreCommand } from './commands/backup.js';
import { statusCommand } from './commands/status.js';
import { handoffCommand } from './commands/handoff.js';
import { rebuildCommand } from './commands/rebuild.js';
import { importCommand } from './commands/import.js';

export function commands(): readonly Command[] {
  return [docsCommand(), taskCommand(), describeCommand(), doctorCommand(), backupCommand(), restoreCommand(), statusCommand(), handoffCommand(), rebuildCommand(), importCommand()];
}
