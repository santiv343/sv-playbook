export const SUGGESTED_COMMAND_KIND = {
  UNKNOWN_COMMAND: 'unknown-command',
  UNKNOWN_SUBCOMMAND: 'unknown-subcommand',
  UNKNOWN_FLAG: 'unknown-flag',
} as const;

export const CLI_COMMAND_SOURCE_PREFIX = 'src/cli/commands/';
export const CLI_SURFACE_SOURCE_PREFIX = 'src/cli/';
export const GENERATED_COMMAND_INDEX_SUFFIX = '.gen.ts';
export const FIXTURE_FILE_MARKER = '__fixture__';

export const MARKDOWN_ROOTS = [CONTENT_DIRECTORY_NAME, PACKETS_DOCS_DIR] as const;
export const MARKDOWN_SUFFIX = FILE_EXTENSION.MARKDOWN;
// Dated subdirectories are frozen snapshots by repo convention (YYYY-MM-DD-*):
// they quote the past or the intended future verbatim and are not living guidance.
// Living guidance is content/**, docs/*.md at the root, and docs/constitution/**.
export const EXCLUDED_MARKDOWN_PREFIXES = [
  `${PACKETS_DOCS_DIR}/${PACKETS_DIR}/`,
  'docs/design/',
  'docs/plans/',
  'docs/research/',
  'docs/specs/',
] as const;

// In markdown only code spans and fenced blocks count as executable suggestions;
// prose may talk *about* a flag or command without suggesting it.
export const FENCED_CODE_BLOCK_PATTERN = /```[\s\S]*?```/g;
export const INLINE_CODE_SPAN_PATTERN = /`([^`\n]+)`/g;

export const COMMAND_SUGGESTION_PATTERN = /\bsv-playbook\s+([a-z][a-z0-9-]*)(?:\s+([a-z][a-z0-9-]*))?/g;
export const FLAG_SUGGESTION_PATTERN = /--([a-z][a-z0-9-]+)/g;

// Surface mining is restricted to *declarations* so a suggestion message can never
// whitelist itself: command names from `name:` properties (resolving simple const
// references), subcommands and flags from standalone literals that start with the
// CLI name (usage declarations), flags from parseArgs option keys and standalone
// literals.
export const COMMAND_NAME_DECLARATION_PATTERN = /\bname:\s*'([a-z][a-z0-9-]*)'/g;
export const COMMAND_NAME_REFERENCE_PATTERN = /\bname:\s*([A-Z][A-Z0-9_]*)/g;
export const CONSTANT_STRING_DECLARATION_PATTERN = /\bconst\s+([A-Z][A-Z0-9_]*)\s*=\s*'([a-z][a-z0-9-]*)'/g;
export const USAGE_LITERAL_PATTERN = /'(\s*sv-playbook [^']*)'/g;
export const OPTION_KEY_PATTERN = /['"]?([a-zA-Z][a-zA-Z0-9-]*)['"]?\s*:\s*(?:STRING_OPTION|STRING_LIST_OPTION|BOOLEAN_OPTION|\{\s*type:)/g;
export const FLAG_LITERAL_PATTERN = /['"](--[a-z][a-z0-9-]+)['"]/g;
// A command takes a free-form first positional when its usage puts a placeholder
// right after the command name (`sv-playbook docs [topic]`); then any second token
// is a value, not a subcommand.
export const POSITIONAL_USAGE_PATTERN = /\bsv-playbook\s+[a-z][a-z0-9-]*\s+[<[]/;

import { GH_ARGUMENT } from '../gh.constants.js';
import { GIT_ARGUMENT } from '../git.constants.js';
import { CONTENT_DIRECTORY_NAME, FILE_EXTENSION } from '../platform.constants.js';
import { PACKETS_DIR, PACKETS_DOCS_DIR } from '../tasks/service.constants.js';

// External-tool invocations quoted in code and living docs (git, gh, node, agent
// CLIs). The gate's contract is "the flag must exist somewhere real"; these exist,
// just not in this CLI. Entries reference the shared argument constants instead of
// repeating literals (string-duplication debt only goes down); bare literals cover
// flags that appear only in markdown docs, where no constant can be referenced.
export const EXTERNAL_FLAG_ALLOWLIST: readonly string[] = [
  GIT_ARGUMENT.ABBREV_REF,
  GIT_ARGUMENT.BRANCH,
  GIT_ARGUMENT.DETACH,
  GIT_ARGUMENT.GIT_COMMON_DIR,
  GIT_ARGUMENT.IS_ANCESTOR,
  GIT_ARGUMENT.NAME_ONLY,
  GIT_ARGUMENT.PORCELAIN,
  GIT_ARGUMENT.SHOW_TOPLEVEL,
  GIT_ARGUMENT.VERIFY,
  GH_ARGUMENT.JQ,
  '--body',
  '--output-format',
  '--sandbox',
  '--skip-git-repo-check',
  '--skip-onboarding',
  '--test',
  '--untracked-files',
  '--yolo',
];
