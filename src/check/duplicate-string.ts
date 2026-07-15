import ts from 'typescript';
import {
  DUPLICATE_STRING_KIND,
  SYNTAX_NAME_PROPERTY,
  TEST_FILE_MARKER,
} from './duplicate-string.constants.js';
import type {
  DuplicateStringInventory,
  DuplicateStringSource,
  DuplicateStringViolation,
} from './duplicate-string.types.js';
import { evaluateSourceBaseline } from './source-baseline.js';
import type { SourceBaseline, SourceBaselineEvaluation } from './source-baseline.types.js';
import { sourceFingerprint, sourceInventoryDigest } from './source-fingerprint.js';
import { SOURCE_FILE_SUFFIX } from './source-tree.constants.js';
import { normalizedSourcePath, readCheckedSources } from './source-tree.js';
import { EMPTY_SIZE } from '../platform.constants.js';

interface StringOccurrence {
  readonly column: number;
  readonly line: number;
  readonly path: string;
  readonly value: string;
}

function isTestSource(path: string): boolean {
  return path.includes(TEST_FILE_MARKER.TEST) || path.includes(TEST_FILE_MARKER.SPEC);
}

function scriptKind(path: string): ts.ScriptKind {
  return path.endsWith(SOURCE_FILE_SUFFIX.JAVASCRIPT) ? ts.ScriptKind.JS : ts.ScriptKind.TS;
}

function isStructuralLiteral(node: ts.StringLiteralLike): boolean {
  const parent = node.parent;
  if (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent)) return true;
  if (ts.isExternalModuleReference(parent) || ts.isLiteralTypeNode(parent)) return true;
  return SYNTAX_NAME_PROPERTY in parent && parent.name === node;
}

function executableValue(node: ts.Node): ts.StringLiteralLike | undefined {
  if (!ts.isStringLiteral(node) && !ts.isNoSubstitutionTemplateLiteral(node)) return undefined;
  if (isStructuralLiteral(node)) return undefined;
  const value = node.text.trim();
  return value.length > EMPTY_SIZE && /[\p{L}\p{N}]/u.test(value) ? node : undefined;
}

function occurrences(source: DuplicateStringSource): StringOccurrence[] {
  if (isTestSource(source.path) || source.path.endsWith(SOURCE_FILE_SUFFIX.DECLARATION)) return [];
  const path = normalizedSourcePath(source.path);
  const sourceFile = ts.createSourceFile(path, source.source, ts.ScriptTarget.Latest, true, scriptKind(path));
  const found: StringOccurrence[] = [];
  const visit = (node: ts.Node): void => {
    const literal = executableValue(node);
    if (literal !== undefined) {
      const location = sourceFile.getLineAndCharacterOfPosition(literal.getStart(sourceFile));
      found.push({
        column: location.character + 1,
        line: location.line + 1,
        path,
        value: literal.text.trim(),
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

function fingerprint(item: StringOccurrence): string {
  return sourceFingerprint([DUPLICATE_STRING_KIND, item.value]);
}

function compareOccurrences(left: StringOccurrence, right: StringOccurrence): number {
  return left.path.localeCompare(right.path) || left.line - right.line || left.column - right.column;
}

export function inspectDuplicateStrings(sources: readonly DuplicateStringSource[]): DuplicateStringInventory {
  const byValue = new Map<string, StringOccurrence[]>();
  for (const item of sources.flatMap(occurrences)) {
    const group = byValue.get(item.value) ?? [];
    group.push(item);
    byValue.set(item.value, group);
  }
  const violations: DuplicateStringViolation[] = [...byValue.values()]
    .flatMap((group) => group.sort(compareOccurrences).slice(1))
    .sort(compareOccurrences)
    .map((item) => ({ ...item, fingerprint: fingerprint(item) }));
  const digest = sourceInventoryDigest(violations.map((item) => item.fingerprint));
  return { count: violations.length, digest, violations };
}

export function inspectDuplicateStringTree(repoRoot: string): DuplicateStringInventory {
  return inspectDuplicateStrings(readCheckedSources(repoRoot));
}

export function evaluateDuplicateStringBaseline(
  inventory: DuplicateStringInventory,
  baseline: SourceBaseline | undefined,
): SourceBaselineEvaluation {
  return evaluateSourceBaseline('duplicate string', inventory, baseline);
}
