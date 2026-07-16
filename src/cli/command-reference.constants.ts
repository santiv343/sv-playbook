export const COMMAND_REFERENCE_MARKERS = {
  BEGIN: '<!-- GENERATED:command-reference — do not edit below; regenerate: npx tsx src/cli/generate-command-reference.ts -->',
  END: '<!-- /GENERATED:command-reference -->',
} as const;

export const MARKER_NOT_FOUND = -1;

export const COMMAND_REFERENCE_TABLE_HEADER: readonly string[] = [
  '| Command | Purpose |',
  '|---|---|',
];

export const COMMAND_REFERENCE_DOC_URL = new URL('../../docs/how-it-works.md', import.meta.url);
