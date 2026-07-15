import ts from 'typescript';
import {
  COMPARISON_OPERATOR,
  LITERAL_COMPARISON_KIND,
} from './literal-comparison.constants.js';
import type {
  LiteralComparisonInventory,
  LiteralComparisonSource,
  LiteralComparisonViolation,
} from './literal-comparison.types.js';
import { evaluateSourceBaseline } from './source-baseline.js';
import type { SourceBaseline, SourceBaselineEvaluation } from './source-baseline.types.js';
import { sourceFingerprint, sourceInventoryDigest } from './source-fingerprint.js';
import { normalizedSourcePath, readCheckedSources } from './source-tree.js';

function numericLiteral(node: ts.Node): number | undefined {
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (!ts.isPrefixUnaryExpression(node) || node.operator !== ts.SyntaxKind.MinusToken) return undefined;
  return ts.isNumericLiteral(node.operand) ? -Number(node.operand.text) : undefined;
}

function isNumericComparison(node: ts.Node): boolean {
  if (ts.isBinaryExpression(node)) {
    const operator = node.operatorToken.getText();
    return COMPARISON_OPERATOR.has(operator)
      && (numericLiteral(node.left) !== undefined || numericLiteral(node.right) !== undefined);
  }
  return ts.isCaseClause(node) && numericLiteral(node.expression) !== undefined;
}

function violation(source: LiteralComparisonSource, sourceFile: ts.SourceFile, node: ts.Node): LiteralComparisonViolation {
  const location = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  const path = normalizedSourcePath(source.path);
  const text = node.getText(sourceFile).replace(/\s+/g, ' ').trim();
  const kind = LITERAL_COMPARISON_KIND.NUMBER;
  return {
    column: location.character + 1,
    fingerprint: sourceFingerprint([path, kind, text]),
    kind,
    line: location.line + 1,
    path,
  };
}

export function inspectLiteralComparisons(source: LiteralComparisonSource): LiteralComparisonViolation[] {
  const sourceFile = ts.createSourceFile(source.path, source.source, ts.ScriptTarget.Latest, true);
  const violations: LiteralComparisonViolation[] = [];
  const visit = (node: ts.Node): void => {
    if (isNumericComparison(node)) violations.push(violation(source, sourceFile, node));
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return violations;
}

export function inspectLiteralComparisonTree(repoRoot: string): LiteralComparisonInventory {
  const violations = readCheckedSources(repoRoot).flatMap(inspectLiteralComparisons)
    .sort((left, right) => left.path.localeCompare(right.path)
    || left.line - right.line || left.column - right.column);
  const digest = sourceInventoryDigest(violations.map((item) => item.fingerprint));
  return { count: violations.length, digest, violations };
}

export function evaluateLiteralComparisonBaseline(
  inventory: LiteralComparisonInventory,
  baseline: SourceBaseline | undefined,
): SourceBaselineEvaluation {
  return evaluateSourceBaseline('literal comparison', inventory, baseline);
}
