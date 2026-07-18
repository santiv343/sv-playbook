import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { EXIT } from '../command.constants.js';
import type { Command, Io } from '../command.types.js';
import { getCwd } from '../../runtime/context.js';
import { parsePacketDocument } from '../../packets/document.js';
import { loadConfig } from '../../config.js';
import { checkViolation } from '../../baseline.js';
import { BASELINE_RESULT } from '../../baseline.constants.js';
import type { BaselineConfig } from '../../config.types.js';
import { FILE_EXTENSION } from '../../platform.constants.js';
import { commonRoot, openStore } from '../../db/store.js';
import { checkRoleSystem } from '../../roles/system-check.js';
import { renderInstructionsContent } from './instructions.js';

const PACKETS_DIR = 'docs/packets';

const REQUIRED_SECTIONS = ['## Task', '## RED test', '## Stop conditions', '## Evidence'];

const HARNESS_FILES = ['AGENTS.md', 'CLAUDE.md'];

async function listMarkdownFiles(root: string, dir: string): Promise<string[]> {
  const dirPath = join(root, dir);
  try {
    const entries = await readdir(dirPath);
    return entries.filter((e) => e.endsWith(FILE_EXTENSION.MARKDOWN));
  } catch {
    return [];
  }
}

function checkPacketSections(file: string, body: string, io: Io, baselined?: boolean): boolean {
  const missing: string[] = [];
  for (const section of REQUIRED_SECTIONS) {
    if (!body.includes(section)) {
      missing.push(section);
    }
  }
  if (missing.length === 0) return false;

  if (baselined) {
    io.out(`${PACKETS_DIR}/${file}: baselined — skipping grandfathered missing sections: ${missing.join(', ')}`);
    return false;
  }

  for (const section of missing) {
    io.out(`${PACKETS_DIR}/${file}: missing required section ${section}`);
  }
  return true;
}

async function checkOnePacket(root: string, file: string, baseline: BaselineConfig | undefined, io: Io): Promise<boolean> {
  const content = await readFile(join(root, PACKETS_DIR, file), 'utf-8');
  const fingerprint = `${PACKETS_DIR}/${file}`;
  const isGrandfathered = checkViolation(fingerprint, baseline) === BASELINE_RESULT.GRANDFATHERED;
  let body: string;
  try {
    body = parsePacketDocument(content).body;
  } catch (err) {
    if (isGrandfathered) {
      io.out(`${PACKETS_DIR}/${file}: baselined frontmatter error — skipping`);
      return false;
    }
    io.out(`${PACKETS_DIR}/${file}: malformed frontmatter - ${err instanceof Error ? err.message : String(err)}`);
    return true;
  }
  return checkPacketSections(file, body, io, isGrandfathered);
}

async function checkStructure(root: string, io: Io): Promise<boolean> {
  const config = loadConfig(root);
  const baseline = config.baseline;
  const files = await listMarkdownFiles(root, PACKETS_DIR);
  const results = await Promise.all(files.map((f) => checkOnePacket(root, f, baseline, io)));
  return results.some(Boolean);
}

async function checkInstructions(root: string, io: Io): Promise<boolean> {
  let hasDrift = false;

  let expected: string;
  try {
    expected = await renderInstructionsContent(root);
  } catch (err) {
    io.out(`instructions: failed to render expected content - ${err instanceof Error ? err.message : String(err)}`);
    return true;
  }

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
  roles: checkRolesTarget,
};

async function checkRolesTarget(root: string, io: Io): Promise<boolean> {
  const repoRoot = commonRoot(root);
  const store = openStore(repoRoot);
  try {
    const result = await checkRoleSystem(store, repoRoot);
    for (const violation of result.violations) io.out(`roles: ${violation}`);
    return !result.valid;
  } finally {
    store.close();
  }
}

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

export const command: Command = {
  name: 'check',
    summary: 'Validate authored artifacts (structure, instructions drift)',
    async run(args, io) {
      const root = getCwd();
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
