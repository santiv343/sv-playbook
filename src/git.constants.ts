export const GIT_EXECUTABLE = 'git';
export const GIT_ARGUMENT = {
  ABBREV_REF: '--abbrev-ref',
  ALLOW_EMPTY: '--allow-empty',
  BRANCH: '--branch',
  DETACH: '--detach',
  DIFF: 'diff',
  GIT_COMMON_DIR: '--git-common-dir',
  HEAD: 'HEAD',
  IS_ANCESTOR: '--is-ancestor',
  MERGE_BASE: 'merge-base',
  NAME_ONLY: '--name-only',
  PORCELAIN: '--porcelain',
  PORCELAIN_V1: '--porcelain=v1',
  NULL_TERMINATED: '-z',
  REV_PARSE: 'rev-parse',
  SHOW_TOPLEVEL: '--show-toplevel',
  STATUS: 'status',
  UNTRACKED_FILES_ALL: '--untracked-files=all',
  VERIFY: '--verify',
} as const;

export { PROCESS_STDIO } from './platform.constants.js';
