import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { EXIT } from '../command.constants.js';
import type { Command, Io } from '../command.types.js';
import { parsePacketDocument } from '../../packets/document.js';
import { contentDir } from '../../content.js';
import { loadConfig } from '../../config.js';

const PACKETS_DIR = 'docs/packets';

const REQUIRED_SECTIONS = ['## Task', '## RED test', '## Stop conditions', '## Evidence'];

const HARNESS_FILES = ['AGENTS.md', 'CLAUDE.md'];

async function listMarkdownFiles(root: string, dir: string): Promise<string[]> {
  const dirPath = join(root, dir);
  try {
    const entries = await readdir(dirPath);
    return entries.filter((e) => e.endsWith('.md'));
  } catch {
    return [];
  }
}

function checkPacketSections(file: string, body: string, io: Io): boolean {
  let hasViolations = false;
  for (const section of REQUIRED_SECTIONS) {
    if (!body.includes(section)) {
      io.out(`${PACKETS_DIR}/${file}: missing required section ${section}`);
      hasViolations = true;
    }
  }
  return hasViolations;
}

async function checkStructure(root: string, io: Io): Promise<boolean> {
  let hasViolations = false;
  const files = await listMarkdownFiles(root, PACKETS_DIR);

  for (const file of files) {
    const filePath = join(root, PACKETS_DIR, file);
    const content = await readFile(filePath, 'utf-8');

    let body: string;
    try {
      body = parsePacketDocument(content).body;
    } catch (err) {
      io.out(`${PACKETS_DIR}/${file}: malformed frontmatter - ${err instanceof Error ? err.message : String(err)}`);
      hasViolations = true;
      continue;
    }

    if (checkPacketSections(file, body, io)) hasViolations = true;
  }

  return hasViolations;
}

async function checkInstructions(root: string, io: Io): Promise<boolean> {
  let hasDrift = false;

  const templatePath = join(contentDir(), 'instructions/cold-start.md');
  let template: string;
  try {
    template = await readFile(templatePath, 'utf8');
  } catch {
    io.out('instructions: missing cold-start template');
    return true;
  }

  const config = loadConfig(root);
  const expected = template
    .replace(/\{\{productName\}\}/g, config.productName)
    .replace(/\{\{tier\}\}/g, config.tier)
    .replace(/\{\{verifyCommand\}\}/g, config.verifyCommand);

  for (const harness of HARNESS_FILES) {
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

async function runTarget(root: string, target: string, io: Io): Promise<number | null> {
  const fn = TARGETS[target];
  if (fn === undefined) {
    io.err(`Unknown check target: ${target}`);
    return EXIT.USAGE;
  }
  try {
    const violations = await fn(root, io);
    return violations ? EXIT.GATE_FAIL : null;
  } catch (err: unknown) {
    io.err(`check ${target}: ${err instanceof Error ? err.message : String(err)}`);
    return EXIT.SYSTEM;
  }
}

export function checkCommand(): Command {
  return {
    name: 'check',
    summary: 'Validate authored artifacts (structure, instructions drift)',
    async run(args, io) {
      const root = process.cwd();
      const targets = args.length === 0 ? Object.keys(TARGETS) : args;
      let hasViolations = false;

      for (const target of targets) {
        const result = await runTarget(root, target, io);
        if (result === EXIT.USAGE || result === EXIT.SYSTEM) return result;
        if (result === EXIT.GATE_FAIL) hasViolations = true;
      }

      return hasViolations ? EXIT.GATE_FAIL : EXIT.OK;
    },
  };
}
