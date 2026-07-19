import { EXIT } from '../command.constants.js';
import type { Command } from '../command.types.js';

export const command: Command = {
  name: '__fixture__',
  summary: 'Auto-discovery fixture command',
  usage: 'Usage: sv-playbook __fixture__',
  run: () => Promise.resolve(EXIT.OK),
};
