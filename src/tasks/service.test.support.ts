import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PLAYBOOK_CONFIG_FILE_NAME } from '../config.constants.js';
import { openStore } from '../db/store.js';
import { TEXT_ENCODING } from '../platform.constants.js';
import { initTestRepo } from '../testkit.js';
import { testConfig } from '../testkit-fixtures.test.js';

export function initializeTestGitRepository(root: string): void {
  initTestRepo(root);
}

export async function writeServiceTestConfig(root: string): Promise<void> {
  const { writeFile } = await import('node:fs/promises');
  await writeFile(join(root, PLAYBOOK_CONFIG_FILE_NAME), testConfig, TEXT_ENCODING.UTF8);
}

export async function setupServiceTest() {
  const root = await mkdtemp(join(tmpdir(), 'svp-life-'));
  initializeTestGitRepository(root);
  return { root, store: openStore(root) };
}
