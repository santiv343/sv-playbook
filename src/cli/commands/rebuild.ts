import { EXIT, type Command } from '../command.js';
import { rebuildFromFiles } from '../../tasks/service.js';
import { commonRoot } from '../../db/store.js';

export const rebuildCommand: Command = {
  name: 'rebuild',
  summary: 'Rebuild the packet database from the markdown files in docs/packets/',
  run(args, io): Promise<number> {
    if (args.length > 0) {
      io.err('Usage: sv-playbook rebuild');
      return Promise.resolve(EXIT.USAGE);
    }
    const repoRoot = commonRoot(process.cwd());
    const counts = rebuildFromFiles(repoRoot);
    io.out(`rebuilt: ${counts.total} packets (${counts.done} done, ${counts.dropped} dropped, ${counts.draft} draft)`);
    return Promise.resolve(EXIT.OK);
  },
};
