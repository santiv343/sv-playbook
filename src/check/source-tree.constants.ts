export const CHECKED_SOURCE_ROOTS = ['src', 'content/ui'] as const;
export const SOURCE_FILE_SUFFIX = {
  DECLARATION: '.d.ts',
  JAVASCRIPT: '.js',
  TYPESCRIPT: '.ts',
} as const;
export const CHECKED_SOURCE_SUFFIXES = [
  SOURCE_FILE_SUFFIX.TYPESCRIPT,
  SOURCE_FILE_SUFFIX.JAVASCRIPT,
] as const;
export const DECLARATION_SOURCE_SUFFIX = SOURCE_FILE_SUFFIX.DECLARATION;
export const TYPESCRIPT_SOURCE_ROOT_PREFIX = 'src/' as const;
