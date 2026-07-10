import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { EXIT } from '../command.constants.js';
import type { Command, Io } from '../command.types.js';
import { parsePacketDocument } from '../../packets/document.js';
import { contentDir } from '../../content.js';
import { loadConfig } from '../../config.js';
import { renderInstructions } from './instructions.js';

const PACKETS_DIR = 'docs/packets';

const REQUIRED_SECTIONS = ['## Task', '## RED test', '## Stop conditions', '## Evidence'];

interface Violation {
  file: string;
  missing: string;
}

async function listMarkdownFiles(root: string, dir: string): Promise<string[]> {
  const dirPath = join(root, dir);
  try {
    const entries = await readdir(dirPath);
    return entries.filter((e) => e.endsWith('.md'));
  } catch {
    return [];
  }
}

async function checkStructure(root: string, io: Io): Promise<boolean> {
  let hasViolations = false;

  const files = await listMarkdownFiles(root, PACKETS_DIR);

  for (const file of files) {
    const relPath = `${PACKETS_DIR}/${file}`;
    const filePath = join(root, relPath);
    const content = await readFile(filePath, 'utf-8');

    let body: string;
    try {
      const parsed = parsePacketDocument(content);
      body = parsed.body;
    } catch (err) {
      io.out(`${relPath}: malformed frontmatter - ${err instanceof Error ? err.message : String(err)}`);
      hasViolations = true;
      continue;
    }

    for (const section of REQUIRED_SECTIONS) {
      if (!body.includes(section)) {
        io.out(`${relPath}: missing required section ${section}`);
        hasViolations = true;
      }
    }
  }

  return hasViolations;
}

async function checkInstructions(root: string, io: Io): Promise<boolean> {
  const harnessFiles = ['AGENTS.md', 'CLAUDE.md'];
  let hasDrift = false;

  const config = loadConfig(root);
  const contentRoot = contentDir();
  const templatePath = join(contentRoot, 'instructions/cold-start.md');

  let template: string;
  try {
    template = await readFile(templatePath, 'utf8');
  } catch {
    io.out('instructions: missing cold-start template');
    return true;
  }

  const expected = template
    .replace(/\{\{productName\}\}/g, config.productName)
    .replace(/\{\{tier\}\}/g, config.tier)
    .replace(/\{\{verifyCommand\}\}/g, config.verifyCommand);

  for (const harness of harnessFiles) {
    const harnessPath = join(root, harness);
    let actual: string;
    try {
      actual = await readFile(harnessPath, 'utf8');
    } catch {
      io.out(`instructions: ${harness} missing`);
      hasDrift = true;
      continue;
    }

    if (actual !== expected) {
      io.out(`instructions: ${harness} diverges from source`);
      hasDrift = true;
    }
  }

  return hasDrift;
}

const TARGETS: Record<string, (root: string, io: Io) => Promise<boolean>> = {
  structure: checkStructure,
  instructions: checkInstructions,
};

export function checkCommand(): Command {
  return {
    name: 'check',
    summary: 'Validate authored artifacts (structure, instructions drift)',
    async run(args, io) {
      const root = process.cwd();
      const targets = args.length === 0 ? Object.keys(TARGETS) : args;
      let hasViolations = false;

      for (const target of targets) {
        const fn = TARGETS[target];
        if (fn === undefined) {
          io.err(`Unknown check target: ${target}`);
          return EXIT.USAGE;
        }
        try {
          const violations = await fn(root, io);
          if (violations) hasViolations = true;
        } catch (err) {
          io.err(`check ${target}: ${err instanceof Error ? err.message : String(err)}`);
          return EXIT.SYSTEM;
        }
      }

      return hasViolations ? EXIT.GATE_FAIL : EXIT.OK;
    },
  };
}
