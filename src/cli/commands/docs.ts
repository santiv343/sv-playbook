import { EXIT } from '../command.constants.js';
import type { Command } from '../command.types.js';
import { listTopics, readTopic } from '../../content.js';

const AVAILABLE_TOPICS = 'Available topics:';

// `docs <topic>` es el acceso de un agente al material vivo de
// `content/*.md` (principios, taste, dispatch, skills) — mismo contentDir()
// que instructions.ts usa para el cold-start, pero acá expuesto tópico por
// tópico bajo demanda en vez de todo compilado en un solo render. Sin
// argumento, lista los tópicos disponibles; con uno inválido, también lista
// (no sólo un error genérico) — el CLI se autodocumenta incluso al fallar.
export const command: Command = {
  name: 'docs',
  summary: 'Print a playbook process document (list topics when no argument)',
  usage: 'Usage: sv-playbook docs [<topic>]',
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
