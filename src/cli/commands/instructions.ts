import { writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { EXIT } from '../command.constants.js';
import type { Command, Io } from '../command.types.js';
import { getCwd } from '../../runtime/context.js';
import { loadConfig } from '../../config.js';
import { contentDir } from '../../content.js';
import { loadContextCatalog } from '../../context/repository.js';
import { compileContext } from '../../context/compiler.js';
import { BUNDLED_ROLE_ID } from '../../roles/bundled-profile.constants.js';
import { commonRoot, openStore } from '../../db/store.js';

const TEMPLATE_PATH = 'instructions/cold-start';

interface RenderOptions {
  root: string;
  io: Io;
  write: boolean;
}

interface HarnessSpec {
  file: string;
}

const HARNESSES: HarnessSpec[] = [
  { file: 'AGENTS.md' },
  { file: 'CLAUDE.md' },
];

// El pipeline real de cold-start (flujo 05): toma la plantilla fija
// (content/instructions/cold-start.md), sustituye placeholders de config
// simples ({{tier}}, {{verifyCommand}}), y para el bloque de contexto
// compila un context pack REAL para el rol human-interface — no es texto
// hardcodeado, es el mismo compileContext() que arma contexto para
// cualquier agente, aplicado acá al operador humano en su primer contacto
// con el repo. AGENTS.md y CLAUDE.md reciben EXACTAMENTE el mismo render
// (un solo `rendered`, dos destinos) — PRINCIPLE-004 (una fuente, N
// espejos) en código.
export async function renderInstructionsContent(root: string): Promise<string> {
  const config = loadConfig(root);
  const contentRoot = contentDir();
  const template = await readFile(join(contentRoot, `${TEMPLATE_PATH}.md`), 'utf8');

  const store = openStore(commonRoot(root));
  let humanInterfaceContext: string;
  try {
    const catalog = loadContextCatalog(store);
    const pack = compileContext(catalog, {
      role: BUNDLED_ROLE_ID.HUMAN_INTERFACE,
      phase: 'intake',
      requestedCapabilities: [],
    });
    humanInterfaceContext = pack.items.map((item) => item.body).join('\n\n---\n\n');
  } finally {
    store.close();
  }

  return template
    .replace(/\{\{productName\}\}/g, config.productName)
    .replace(/\{\{tier\}\}/g, config.tier)
    .replace(/\{\{verifyCommand\}\}/g, config.verifyCommand)
    .replace(/\{\{humanInterfaceContext\}\}/g, humanInterfaceContext);
}

export async function renderInstructions(opts: RenderOptions): Promise<void> {
  const rendered = await renderInstructionsContent(opts.root);

  if (opts.write) {
    for (const harness of HARNESSES) {
      await writeFile(join(opts.root, harness.file), rendered, 'utf8');
    }
    opts.io.out('Instructions generated successfully.');
  } else {
    opts.io.out(rendered);
  }
}

export const command: Command = {
  name: 'instructions',
  summary: 'Generate cold-start agent instructions from a single source',
  usage: 'Usage: sv-playbook instructions [--write]',
  async run(args, io) {
    const parsed = parseArgs({
      args,
      options: {
        write: { type: 'boolean' },
      },
    });
    const root = getCwd();
    await renderInstructions({ root, io, write: !!parsed.values.write });
    return EXIT.OK;
  },
};
