import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import {
  CLI_COMMAND_SOURCE_PREFIX,
  CLI_SURFACE_SOURCE_PREFIX,
  COMMAND_NAME_DECLARATION_PATTERN,
  COMMAND_NAME_REFERENCE_PATTERN,
  COMMAND_SUGGESTION_PATTERN,
  CONSTANT_STRING_DECLARATION_PATTERN,
  EXCLUDED_MARKDOWN_PREFIXES,
  EXTERNAL_FLAG_ALLOWLIST,
  FENCED_CODE_BLOCK_PATTERN,
  FIXTURE_FILE_MARKER,
  FLAG_LITERAL_PATTERN,
  FLAG_SUGGESTION_PATTERN,
  GENERATED_COMMAND_INDEX_SUFFIX,
  INLINE_CODE_SPAN_PATTERN,
  MARKDOWN_ROOTS,
  MARKDOWN_SUFFIX,
  OPTION_KEY_PATTERN,
  POSITIONAL_USAGE_PATTERN,
  SUGGESTED_COMMAND_KIND,
  USAGE_LITERAL_PATTERN,
} from './suggested-command.constants.js';
import type {
  CommandSurface,
  SuggestedCommandInventory,
  SuggestedCommandKind,
  SuggestedCommandSource,
  SuggestedCommandViolation,
} from './suggested-command.types.js';
import { TEST_FILE_MARKER } from './duplicate-string.constants.js';
import { SOURCE_FILE_SUFFIX } from './source-tree.constants.js';
import { normalizedSourcePath, readCheckedSources } from './source-tree.js';
import { TEXT_ENCODING } from '../platform.constants.js';

interface SuggestionText {
  readonly offset: number;
  readonly text: string;
}

interface Position {
  readonly column: number;
  readonly line: number;
}

interface MutableSurface {
  readonly flags: Set<string>;
  readonly names: Set<string>;
  readonly positionals: Set<string>;
  readonly subcommands: Map<string, Set<string>>;
}

type ViolationRecord = (kind: SuggestedCommandKind, value: string, context: string, index: number) => void;

function isTestSource(path: string): boolean {
  return path.includes(TEST_FILE_MARKER.TEST) || path.includes(TEST_FILE_MARKER.SPEC);
}

function positionAt(source: string, index: number): Position {
  const lines = source.slice(0, index).split('\n');
  return { column: (lines[lines.length - 1] ?? '').length + 1, line: lines.length };
}

function isStructuralLiteral(node: ts.Node): boolean {
  const parent = node.parent;
  return ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent) || ts.isExternalModuleReference(parent);
}

function tsSuggestionTexts({ path, source }: SuggestedCommandSource): SuggestionText[] {
  const sourceFile = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const found: SuggestionText[] = [];
  const push = (node: ts.Node, text: string): void => {
    found.push({ offset: node.getStart(sourceFile) + 1, text });
  };
  const visit = (node: ts.Node): void => {
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && !isStructuralLiteral(node)) {
      push(node, node.text);
    } else if (ts.isTemplateExpression(node)) {
      push(node.head, node.head.text);
      for (const span of node.templateSpans) push(span.literal, span.literal.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

function markdownSuggestionTexts({ source }: SuggestedCommandSource): SuggestionText[] {
  const found: SuggestionText[] = [];
  for (const match of source.matchAll(FENCED_CODE_BLOCK_PATTERN)) {
    found.push({ offset: match.index, text: match[0] });
  }
  const masked = source.replace(FENCED_CODE_BLOCK_PATTERN, (block) => block.replace(/[^\n]/g, ' '));
  for (const match of masked.matchAll(INLINE_CODE_SPAN_PATTERN)) {
    if (match[1] !== undefined) found.push({ offset: match.index + 1, text: match[1] });
  }
  return found;
}

function usageTokens(usage: string): { name: string; sub: string | undefined } | undefined {
  const match = new RegExp(COMMAND_SUGGESTION_PATTERN.source).exec(usage);
  if (match === null || match[1] === undefined) return undefined;
  return { name: match[1], sub: match[2] };
}

// Name constants are resolved across the whole cli surface: a command may import
// its `name:` constant from a sibling constants module (e.g. review.constants.ts).
function collectNameConstants(cliSources: readonly SuggestedCommandSource[]): Map<string, string> {
  const constants = new Map<string, string>();
  for (const { source } of cliSources) {
    for (const match of source.matchAll(CONSTANT_STRING_DECLARATION_PATTERN)) {
      if (match[1] !== undefined && match[2] !== undefined) constants.set(match[1], match[2]);
    }
  }
  return constants;
}

function mineUsageLiteral(usage: string, surface: MutableSurface): void {
  const tokens = usageTokens(usage);
  if (tokens !== undefined) {
    const subs = surface.subcommands.get(tokens.name) ?? new Set<string>();
    if (tokens.sub !== undefined) subs.add(tokens.sub);
    surface.subcommands.set(tokens.name, subs);
    if (POSITIONAL_USAGE_PATTERN.test(usage)) surface.positionals.add(tokens.name);
  }
  for (const match of usage.matchAll(FLAG_SUGGESTION_PATTERN)) surface.flags.add(match[0]);
}

function addIfDefined(set: Set<string>, value: string | undefined): void {
  if (value !== undefined) set.add(value);
}

function mineNames(source: string, constants: ReadonlyMap<string, string>, names: Set<string>): void {
  for (const match of source.matchAll(COMMAND_NAME_DECLARATION_PATTERN)) addIfDefined(names, match[1]);
  for (const match of source.matchAll(COMMAND_NAME_REFERENCE_PATTERN)) {
    addIfDefined(names, match[1] === undefined ? undefined : constants.get(match[1]));
  }
}

function mineFlags(source: string, flags: Set<string>): void {
  for (const match of source.matchAll(OPTION_KEY_PATTERN)) {
    if (match[1] !== undefined) flags.add(`--${match[1]}`);
  }
  for (const match of source.matchAll(FLAG_LITERAL_PATTERN)) addIfDefined(flags, match[1]);
}

function mineUsageLiterals(source: string, surface: MutableSurface): void {
  for (const match of source.matchAll(USAGE_LITERAL_PATTERN)) {
    if (match[1] !== undefined) mineUsageLiteral(match[1], surface);
  }
}

export function buildCommandSurface(cliSources: readonly SuggestedCommandSource[]): CommandSurface {
  const surface: MutableSurface = { flags: new Set(), names: new Set(), positionals: new Set(), subcommands: new Map() };
  const constants = collectNameConstants(cliSources);
  for (const { source } of cliSources) {
    mineNames(source, constants, surface.names);
    mineFlags(source, surface.flags);
    mineUsageLiterals(source, surface);
  }
  return surface;
}

function recordCommandSuggestion(
  match: RegExpMatchArray,
  offset: number,
  surface: CommandSurface,
  record: ViolationRecord,
): void {
  const [context, name, sub] = match;
  const index = offset + (match.index ?? 0);
  if (name === undefined || !surface.names.has(name)) {
    record(SUGGESTED_COMMAND_KIND.UNKNOWN_COMMAND, name ?? context, context.trim(), index);
    return;
  }
  if (sub === undefined || surface.positionals.has(name)) return;
  const subs = surface.subcommands.get(name);
  if (subs !== undefined && !subs.has(sub)) {
    record(SUGGESTED_COMMAND_KIND.UNKNOWN_SUBCOMMAND, `${name} ${sub}`, context.trim(), index);
  }
}

function recordFlagSuggestions(text: string, offset: number, surface: CommandSurface, record: ViolationRecord): void {
  for (const match of text.matchAll(FLAG_SUGGESTION_PATTERN)) {
    const flag = match[0];
    if (!surface.flags.has(flag) && !EXTERNAL_FLAG_ALLOWLIST.includes(flag)) {
      record(SUGGESTED_COMMAND_KIND.UNKNOWN_FLAG, flag, text.trim(), offset + match.index);
    }
  }
}

function validateSuggestionTexts(
  path: string,
  source: string,
  texts: readonly SuggestionText[],
  surface: CommandSurface,
): SuggestedCommandViolation[] {
  const violations: SuggestedCommandViolation[] = [];
  const record: ViolationRecord = (kind, value, context, index) => {
    violations.push({ context, kind, path, value, ...positionAt(source, index) });
  };
  for (const { offset, text } of texts) {
    for (const match of text.matchAll(COMMAND_SUGGESTION_PATTERN)) {
      recordCommandSuggestion(match, offset, surface, record);
    }
    recordFlagSuggestions(text, offset, surface, record);
  }
  return violations;
}

function compareViolations(left: SuggestedCommandViolation, right: SuggestedCommandViolation): number {
  return left.path.localeCompare(right.path) || left.line - right.line || left.column - right.column;
}

export function inspectSuggestedCommands(
  documents: readonly SuggestedCommandSource[],
  surface: CommandSurface,
): SuggestedCommandInventory {
  const violations = documents.flatMap((document) => {
    const texts = document.path.endsWith(MARKDOWN_SUFFIX)
      ? markdownSuggestionTexts(document)
      : tsSuggestionTexts(document);
    return validateSuggestionTexts(document.path, document.source, texts, surface);
  }).sort(compareViolations);
  return { count: violations.length, violations };
}

function readMarkdownSources(repoRoot: string): SuggestedCommandSource[] {
  return MARKDOWN_ROOTS.flatMap((root) => readdirSync(join(repoRoot, root), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(MARKDOWN_SUFFIX))
    .map((entry) => normalizedSourcePath(relative(repoRoot, join(entry.parentPath, entry.name))))
    .filter((path) => !EXCLUDED_MARKDOWN_PREFIXES.some((prefix) => path.startsWith(prefix)))
    .sort()
    .map((path) => ({ path, source: readFileSync(join(repoRoot, path), TEXT_ENCODING.UTF8) })));
}

export function inspectSuggestedCommandTree(repoRoot: string): SuggestedCommandInventory {
  const sources = readCheckedSources(repoRoot)
    .filter(({ path }) => !isTestSource(path) && !path.endsWith(SOURCE_FILE_SUFFIX.DECLARATION));
  const cliSources = sources.filter(({ path }) => path.startsWith(CLI_SURFACE_SOURCE_PREFIX) && !path.includes(FIXTURE_FILE_MARKER));
  const surface = buildCommandSurface(cliSources);
  const documents = sources.filter(({ path }) =>
    !path.includes(FIXTURE_FILE_MARKER)
    && !(path.startsWith(CLI_COMMAND_SOURCE_PREFIX) && path.endsWith(GENERATED_COMMAND_INDEX_SUFFIX)));
  return inspectSuggestedCommands([...documents, ...readMarkdownSources(repoRoot)], surface);
}
