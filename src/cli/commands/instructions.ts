import { writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { EXIT } from '../command.constants.js';
import type { Command } from '../command.types.js';
import { loadConfig } from '../../config.js';
import { contentDir } from '../../content.js';

const TEMPLATE_PATH = 'instructions/cold-start';

interface RenderOptions {
  root: string;
}

interface HarnessSpec {
  file: string;
}

const HARNESSES: HarnessSpec[] = [
  { file: 'AGENTS.md' },
  { file: 'CLAUDE.md' },
];

export async function renderInstructions(opts: RenderOptions): Promise<void> {
  const config = loadConfig(opts.root);
  const contentRoot = contentDir();
  const template = await readFile(join(contentRoot, `${TEMPLATE_PATH}.md`), 'utf8');
  const rendered = template.replace(/\{\{productName\}\}/g, config.productName);

  for (const harness of HARNESSES) {
    await writeFile(join(opts.root, harness.file), rendered, 'utf8');
  }
}

export function instructionsCommand(): Command {
  return {
    name: 'instructions',
    summary: 'Generate cold-start agent instructions from a single source',
    async run(args, io) {
      const root = process.cwd();
      await renderInstructions({ root });
      io.out('Instructions generated successfully.');
      return EXIT.OK;
    },
  };
}
