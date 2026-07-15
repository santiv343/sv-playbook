export const GIT_EXECUTABLE = 'git';
export const GIT_ARGUMENT = {
  ABBREV_REF: '--abbrev-ref',
  DIFF: 'diff',
  HEAD: 'HEAD',
  MERGE_BASE: 'merge-base',
  NAME_ONLY: '--name-only',
  PORCELAIN: '--porcelain',
  PORCELAIN_V1: '--porcelain=v1',
  NULL_TERMINATED: '-z',
  REV_PARSE: 'rev-parse',
  STATUS: 'status',
  UNTRACKED_FILES_ALL: '--untracked-files=all',
} as const;

export const GIT_BASE_REFERENCE = ['origin/main', 'origin/master', 'main', 'master'] as const;

export const PROCESS_STDIO = { IGNORE: 'ignore', PIPE: 'pipe' } as const;
