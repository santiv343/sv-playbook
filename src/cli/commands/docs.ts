import { EXIT, type Command } from '../command.js';
import { listTopics, readTopic } from '../../content.js';

export const docsCommand: Command = {
  name: 'docs',
  summary: 'Print a playbook process document (list topics when no argument)',
  async run(args, io) {
    const [topic] = args;
    if (topic === undefined) {
      io.out('Available topics:');
      for (const t of await listTopics()) io.out(`  ${t}`);
      return EXIT.OK;
    }
    const text = await readTopic(topic);
    if (text === undefined) {
      io.err(`Unknown topic: ${topic}`);
      io.err('Available topics:');
      for (const t of await listTopics()) io.err(`  ${t}`);
      return EXIT.USAGE;
    }
    io.out(text);
    return EXIT.OK;
  },
};
