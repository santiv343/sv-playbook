import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../config.js';
import { PLAYBOOK_CONFIG_FILE_NAME } from '../config.constants.js';
import { gitOutput } from '../git.js';
import { GIT_ARGUMENT, GIT_EXECUTABLE, PROCESS_STDIO } from '../git.constants.js';
import {
  PREFLIGHT_CLEAN_WORKTREE_KIND,
  PREFLIGHT_FAILURE_CODE,
  PREFLIGHT_PHASE,
  PREFLIGHT_PHASE_DETAIL,
  PREFLIGHT_VERIFY_OUTPUT_TAIL_CHARACTERS,
  PREFLIGHT_VERIFY_EXIT_CODE,
} from './preflight.constants.js';
import { executePreflightCommand } from './preflight-process.js';
import { PREFLIGHT_STATUS, type CleanVerificationReceipt, type PreflightPhaseReceipt } from './preflight.types.js';

interface CleanWorktree {
  readonly candidateSha: string;
  readonly path: string;
}

type PreflightPhase = PreflightPhaseReceipt['phase'];

interface CleanVerificationDependencies {
  readonly createWorktree: (sourceWorktree: string, candidateSha: string) => Promise<CleanWorktree>;
  readonly executeCommand: typeof executePreflightCommand;
  readonly removeWorktree: (sourceWorktree: string, cleanWorktree: string) => void;
}

const DEFAULT_DEPENDENCIES: CleanVerificationDependencies = {
  createWorktree: createCleanWorktree,
  executeCommand: executePreflightCommand,
  removeWorktree(sourceWorktree, cleanWorktree): void {
    execFileSync(GIT_EXECUTABLE, ['worktree', 'remove', '--force', cleanWorktree], {
      cwd: sourceWorktree,
      stdio: PROCESS_STDIO.PIPE,
    });
  },
};

const NO_COMMAND: Pick<PreflightPhaseReceipt, 'command' | 'exitCode' | 'signal' | 'durationMs' | 'outputTail'> = {
  command: null,
  exitCode: null,
  signal: null,
  durationMs: 0,
  outputTail: '',
};

async function createCleanWorktree(sourceWorktree: string, candidateSha: string): Promise<CleanWorktree> {
  const path = await mkdtemp(join(tmpdir(), 'svp-preflight-'));
  try {
    execFileSync(GIT_EXECUTABLE, ['worktree', 'add', '--detach', path, candidateSha], {
      cwd: sourceWorktree,
      stdio: PROCESS_STDIO.PIPE,
    });
    return { candidateSha, path };
  } catch (error: unknown) {
    await rm(path, { recursive: true, force: true });
    throw error;
  }
}

function boundedOutput(value: string): string {
  return value.slice(-PREFLIGHT_VERIFY_OUTPUT_TAIL_CHARACTERS);
}

function worktreePhase(
  status: 'pass' | 'fail',
  failureCode: PreflightPhaseReceipt['failureCode'],
  detail: string,
): PreflightPhaseReceipt {
  return {
    phase: PREFLIGHT_PHASE.WORKTREE,
    status,
    failureCode,
    ...NO_COMMAND,
    outputTail: boundedOutput(detail),
  };
}

function skipPhase(
  phase: PreflightPhase,
  detail: string = PREFLIGHT_PHASE_DETAIL.COMMAND_NOT_CONFIGURED,
): PreflightPhaseReceipt {
  return {
    phase,
    status: PREFLIGHT_STATUS.SKIP,
    failureCode: null,
    ...NO_COMMAND,
    outputTail: detail,
  };
}

function failureCode(
  phase: PreflightPhase,
  timedOut: boolean,
  spawnFailed: boolean,
): PreflightPhaseReceipt['failureCode'] {
  if (timedOut) return PREFLIGHT_FAILURE_CODE.INACTIVITY_TIMEOUT;
  if (spawnFailed) return PREFLIGHT_FAILURE_CODE.SPAWN_FAILED;
  return phase === PREFLIGHT_PHASE.PREPARATION
    ? PREFLIGHT_FAILURE_CODE.PREPARATION_FAILED
    : PREFLIGHT_FAILURE_CODE.VERIFICATION_FAILED;
}

function commandFailureCode(
  phase: PreflightPhase,
  commandPassed: boolean,
  clean: boolean,
  timedOut: boolean,
  spawnFailed: boolean,
): PreflightPhaseReceipt['failureCode'] {
  if (clean) return null;
  if (commandPassed) return PREFLIGHT_FAILURE_CODE.DIRTY_WORKTREE;
  return failureCode(phase, timedOut, spawnFailed);
}

function isWorktreeClean(worktree: string): boolean {
  return gitOutput(worktree, [GIT_ARGUMENT.STATUS, GIT_ARGUMENT.PORCELAIN]) === '';
}

async function commandPhase(
  phase: PreflightPhase,
  command: string,
  worktree: string,
  noOutputTimeoutMs: number,
  executeCommand: typeof executePreflightCommand,
): Promise<PreflightPhaseReceipt> {
  if (command.trim() === '') return skipPhase(phase);
  try {
    const result = await executeCommand(command, worktree, noOutputTimeoutMs);
    const commandPassed = !result.spawnFailed && !result.timedOut
      && result.exitCode === PREFLIGHT_VERIFY_EXIT_CODE.SUCCESS;
    const clean = commandPassed && isWorktreeClean(worktree);
    return {
      phase,
      command,
      status: clean ? PREFLIGHT_STATUS.PASS : PREFLIGHT_STATUS.FAIL,
      failureCode: commandFailureCode(phase, commandPassed, clean, result.timedOut, result.spawnFailed),
      exitCode: result.exitCode,
      signal: result.signal,
      durationMs: result.durationMs,
      outputTail: result.outputTail,
    };
  } catch (error: unknown) {
    return systemFailurePhase(phase, error, command);
  }
}

function systemFailurePhase(
  phase: PreflightPhase,
  error: unknown,
  command: string | null = null,
): PreflightPhaseReceipt {
  return {
    phase,
    command,
    status: PREFLIGHT_STATUS.FAIL,
    failureCode: PREFLIGHT_FAILURE_CODE.SYSTEM_FAILED,
    exitCode: null,
    signal: null,
    durationMs: 0,
    outputTail: boundedOutput(error instanceof Error ? error.message : String(error)),
  };
}

function cleanupPhase(
  sourceWorktree: string,
  worktree: string,
  dependencies: CleanVerificationDependencies,
): PreflightPhaseReceipt {
  const startedAt = Date.now();
  try {
    dependencies.removeWorktree(sourceWorktree, worktree);
    return {
      phase: PREFLIGHT_PHASE.CLEANUP,
      status: PREFLIGHT_STATUS.PASS,
      failureCode: null,
      ...NO_COMMAND,
      durationMs: Date.now() - startedAt,
      outputTail: PREFLIGHT_PHASE_DETAIL.WORKTREE_REMOVED,
    };
  } catch (error: unknown) {
    return {
      phase: PREFLIGHT_PHASE.CLEANUP,
      status: PREFLIGHT_STATUS.FAIL,
      failureCode: PREFLIGHT_FAILURE_CODE.CLEANUP_FAILED,
      ...NO_COMMAND,
      durationMs: Date.now() - startedAt,
      outputTail: boundedOutput(error instanceof Error ? error.message : String(error)),
    };
  }
}

function receipt(candidateSha: string | null, phases: readonly PreflightPhaseReceipt[]): CleanVerificationReceipt {
  const failed = phases.some((phase) => phase.status === PREFLIGHT_STATUS.FAIL
    || phase.status === PREFLIGHT_STATUS.UNKNOWN);
  return {
    boundaryKind: PREFLIGHT_CLEAN_WORKTREE_KIND,
    candidateSha,
    status: failed ? PREFLIGHT_STATUS.FAIL : PREFLIGHT_STATUS.PASS,
    phases,
  };
}

async function configuredPhases(
  worktree: string,
  dependencies: CleanVerificationDependencies,
): Promise<readonly PreflightPhaseReceipt[]> {
  if (!existsSync(join(worktree, PLAYBOOK_CONFIG_FILE_NAME))) {
    return [skipPhase(PREFLIGHT_PHASE.PREPARATION), skipPhase(PREFLIGHT_PHASE.VERIFICATION)];
  }
  let config: ReturnType<typeof loadConfig>;
  try {
    config = loadConfig(worktree);
  } catch (error: unknown) {
    return [
      systemFailurePhase(PREFLIGHT_PHASE.CONFIGURATION, error),
      skipPhase(PREFLIGHT_PHASE.PREPARATION, PREFLIGHT_PHASE_DETAIL.UPSTREAM_PHASE_FAILED),
      skipPhase(PREFLIGHT_PHASE.VERIFICATION, PREFLIGHT_PHASE_DETAIL.UPSTREAM_PHASE_FAILED),
    ];
  }
  const configuration: PreflightPhaseReceipt = {
    phase: PREFLIGHT_PHASE.CONFIGURATION,
    status: PREFLIGHT_STATUS.PASS,
    failureCode: null,
    ...NO_COMMAND,
    outputTail: PREFLIGHT_PHASE_DETAIL.CONFIGURATION_LOADED,
  };
  const preparation = await commandPhase(
    PREFLIGHT_PHASE.PREPARATION,
    config.reviewPreflight.preparationCommand,
    worktree,
    config.reviewPreflight.noOutputTimeoutMs,
    dependencies.executeCommand,
  );
  if (preparation.status === PREFLIGHT_STATUS.FAIL) {
    return [configuration, preparation, skipPhase(
      PREFLIGHT_PHASE.VERIFICATION,
      PREFLIGHT_PHASE_DETAIL.UPSTREAM_PHASE_FAILED,
    )];
  }
  const verification = await commandPhase(
    PREFLIGHT_PHASE.VERIFICATION,
    config.verifyCommand,
    worktree,
    config.reviewPreflight.noOutputTimeoutMs,
    dependencies.executeCommand,
  );
  return [configuration, preparation, verification];
}

export async function runCleanVerification(
  sourceWorktree: string,
  dependencyOverrides: Partial<CleanVerificationDependencies> = {},
): Promise<CleanVerificationReceipt> {
  const dependencies: CleanVerificationDependencies = { ...DEFAULT_DEPENDENCIES, ...dependencyOverrides };
  let candidateSha: string;
  try {
    candidateSha = gitOutput(sourceWorktree, [GIT_ARGUMENT.REV_PARSE, GIT_ARGUMENT.HEAD]);
  } catch (error: unknown) {
    return receipt(null, [worktreePhase(
      PREFLIGHT_STATUS.FAIL,
      PREFLIGHT_FAILURE_CODE.WORKTREE_CREATE_FAILED,
      error instanceof Error ? error.message : String(error),
    )]);
  }
  let clean: CleanWorktree;
  try {
    clean = await dependencies.createWorktree(sourceWorktree, candidateSha);
  } catch (error: unknown) {
    return receipt(candidateSha, [worktreePhase(
      PREFLIGHT_STATUS.FAIL,
      PREFLIGHT_FAILURE_CODE.WORKTREE_CREATE_FAILED,
      error instanceof Error ? error.message : String(error),
    )]);
  }
  const phases: PreflightPhaseReceipt[] = [worktreePhase(
    PREFLIGHT_STATUS.PASS,
    null,
    PREFLIGHT_PHASE_DETAIL.WORKTREE_CREATED,
  )];
  try {
    phases.push(...await configuredPhases(clean.path, dependencies));
  } finally {
    phases.push(cleanupPhase(sourceWorktree, clean.path, dependencies));
  }
  return receipt(clean.candidateSha, phases);
}
