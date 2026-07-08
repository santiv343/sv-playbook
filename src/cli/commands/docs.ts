import { EXIT } from '../command.constants.js';
import type { Command } from '../command.types.js';
import { listTopics, readTopic } from '../../content.js';

const AVAILABLE_TOPICS = 'Available topics:';

export function docsCommand(): Command {
  return {
    name: 'docs',
    summary: 'Print a playbook process document (list topics when no argument)',
    async run(args, io) {
    const [topic] = args;
    if (topic === undefined) {
      io.out(AVAILABLE_TOPICS);
      for (const t of await listTopics()) io.out(`  ${t}`);
      return EXIT.OK;
    }
    const text = await readTopic(topic);
    if (text === undefined) {
      io.err(`Unknown topic: ${topic}`);
      io.err(AVAILABLE_TOPICS);
      for (const t of await listTopics()) io.err(`  ${t}`);
      return EXIT.USAGE;
    }
    io.out(text);
    return EXIT.OK;
    },
  };
}
