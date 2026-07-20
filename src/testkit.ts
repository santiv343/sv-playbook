import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PLAYBOOK_CONFIG_FILE_NAME } from './config.constants.js';
import { GIT_ARGUMENT, GIT_EXECUTABLE } from './git.constants.js';
import { DEFAULT_GIT_BRANCH } from './db/store.constants.js';
import { PROCESS_STDIO, TEXT_ENCODING } from './platform.constants.js';
import {
  GIT_ARG_ADD,
  GIT_ARG_COMMIT,
  GIT_ARG_CONFIG,
  GIT_ARG_INITIAL_MESSAGE,
  testConfig,
  testGitignore,
} from './testkit-fixtures.test.js';

// Test repos must never inherit the host's init.defaultBranch: CI images leave
// it unset (so repos land on 'master'), which breaks every code path that diffs
// against the configured main base reference.
// Fixture compartida por CASI todos los tests de integración del repo —
// fuerza `-b main` explícito (no depende de `init.defaultBranch` del host,
// ver el comentario original arriba) y deja un commit inicial real con
// playbook.config.json + .gitignore ya en el árbol, así cualquier test que
// abra un store sobre este repo encuentra config válida desde el primer
// commit, no un repo vacío que después haya que poblar a mano.
export function initTestRepo(root: string): void {
  execFileSync(GIT_EXECUTABLE, ['init', '-b', DEFAULT_GIT_BRANCH.MAIN], {
    cwd: root,
    stdio: PROCESS_STDIO.IGNORE,
  });
  execFileSync(GIT_EXECUTABLE, [GIT_ARG_CONFIG, 'core.autocrlf', String(false)], { cwd: root, stdio: PROCESS_STDIO.IGNORE });
  execFileSync(GIT_EXECUTABLE, [GIT_ARG_CONFIG, 'user.email', 'test@example.com'], { cwd: root, stdio: PROCESS_STDIO.IGNORE });
  execFileSync(GIT_EXECUTABLE, [GIT_ARG_CONFIG, 'user.name', 'Test'], { cwd: root, stdio: PROCESS_STDIO.IGNORE });
  writeFileSync(join(root, '.gitignore'), testGitignore, TEXT_ENCODING.UTF8);
  writeFileSync(join(root, PLAYBOOK_CONFIG_FILE_NAME), testConfig, TEXT_ENCODING.UTF8);
  execFileSync(GIT_EXECUTABLE, [GIT_ARG_ADD, '.'], { cwd: root, stdio: PROCESS_STDIO.IGNORE });
  execFileSync(GIT_EXECUTABLE, [GIT_ARG_COMMIT, GIT_ARGUMENT.ALLOW_EMPTY, '-m', GIT_ARG_INITIAL_MESSAGE], { cwd: root, stdio: PROCESS_STDIO.IGNORE });
}
