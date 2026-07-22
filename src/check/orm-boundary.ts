import ts from 'typescript';
import {
  ORM_BOUNDARY_SOURCE_KIND,
  ORM_BOUNDARY_VIOLATION,
  DATABASE_HANDLE_MEMBER,
  ORM_INFRASTRUCTURE_PATH,
  RAW_DATABASE_METHOD,
  SQL_IDENTIFIER_SUFFIX,
  SQLITE_MODULE_ID,
  SQL_DDL_PATTERN,
} from './orm-boundary.constants.js';
import { evaluateSourceBaseline } from './source-baseline.js';
import type {
  OrmBoundaryBaseline,
  OrmBoundaryBaselineEvaluation,
  OrmBoundaryInventory,
  OrmBoundarySource,
  OrmBoundaryViolation,
  OrmBoundaryViolationKind,
} from './orm-boundary.types.js';
import { sourceFingerprint, sourceInventoryDigest } from './source-fingerprint.js';
import {
  DECLARATION_SOURCE_SUFFIX,
  SOURCE_FILE_SUFFIX,
  TYPESCRIPT_SOURCE_ROOT_PREFIX,
} from './source-tree.constants.js';
import { normalizedSourcePath, readCheckedSources } from './source-tree.js';

function isExcluded(path: string): boolean {
  const normalized = normalizedSourcePath(path);
  return normalized.startsWith(ORM_INFRASTRUCTURE_PATH)
    || normalized.endsWith(DECLARATION_SOURCE_SUFFIX);
}

function normalizedNodeText(node: ts.Node, sourceFile: ts.SourceFile): string {
  return node.getText(sourceFile).replace(/\s+/g, ' ').trim();
}

function fingerprint(path: string, kind: OrmBoundaryViolationKind, text: string): string {
  return sourceFingerprint([normalizedSourcePath(path), kind, text]);
}

function violation(
  source: OrmBoundarySource,
  sourceFile: ts.SourceFile,
  node: ts.Node,
  kind: OrmBoundaryViolationKind,
): OrmBoundaryViolation {
  const location = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return {
    column: location.character + 1,
    fingerprint: fingerprint(source.path, kind, normalizedNodeText(node, sourceFile)),
    kind,
    line: location.line + 1,
    path: normalizedSourcePath(source.path),
  };
}

function isDatabaseReceiver(node: ts.Expression): boolean {
  return ts.isPropertyAccessExpression(node) && node.name.text === DATABASE_HANDLE_MEMBER;
}

function rawQueryKind(node: ts.CallExpression): OrmBoundaryViolationKind | undefined {
  if (!ts.isPropertyAccessExpression(node.expression)) return undefined;
  const method = node.expression.name.text;
  if (method === RAW_DATABASE_METHOD.PREPARE) return ORM_BOUNDARY_VIOLATION.RAW_QUERY_CALL;
  if (method === RAW_DATABASE_METHOD.EXEC && isDatabaseReceiver(node.expression.expression)) {
    return ORM_BOUNDARY_VIOLATION.RAW_QUERY_CALL;
  }
  return undefined;
}

function isSqliteImport(node: ts.Node): boolean {
  return ts.isImportDeclaration(node)
    && ts.isStringLiteral(node.moduleSpecifier)
    && node.moduleSpecifier.text === SQLITE_MODULE_ID;
}

function isSqlIdentifier(node: ts.Node): boolean {
  return ts.isVariableDeclaration(node)
    && ts.isIdentifier(node.name)
    && node.name.text.toUpperCase().endsWith(SQL_IDENTIFIER_SUFFIX)
    && node.initializer !== undefined
    && (ts.isStringLiteral(node.initializer) || ts.isNoSubstitutionTemplateLiteral(node.initializer));
}

function isDdlLiteral(node: ts.Node): boolean {
  return (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node))
    && SQL_DDL_PATTERN.test(node.getText());
}

// Gate mecánico de "store.orm siempre, SQL crudo sólo DDL en src/db"
// (memoria del proyecto, PRINCIPLE-013 aplicado a acceso a datos):
// clasifica cada nodo del AST en 3 tipos de violación posibles —
// RAW_QUERY_CALL (`.prepare()`/`.exec()` sobre un handle `.db`),
// DATABASE_HANDLE (importar `node:sqlite` directo, o acceder a `.db`
// fuera de `src/db/`), SQL_LITERAL (una variable `*_SQL` o un template
// literal que matchea un patrón de DDL). `isExcluded()` (arriba) es lo
// que le da a `src/db/` su excepción legítima — el resto del código no la
// tiene.
function classifyNode(node: ts.Node): OrmBoundaryViolationKind | undefined {
  if (ts.isCallExpression(node)) {
    const rawKind = rawQueryKind(node);
    if (rawKind !== undefined) return rawKind;
  }
  if (isSqliteImport(node)) return ORM_BOUNDARY_VIOLATION.DATABASE_HANDLE;
  if (ts.isPropertyAccessExpression(node) && node.name.text === DATABASE_HANDLE_MEMBER) {
    return ORM_BOUNDARY_VIOLATION.DATABASE_HANDLE;
  }
  if (isSqlIdentifier(node)) return ORM_BOUNDARY_VIOLATION.SQL_LITERAL;
  if (isDdlLiteral(node)) return ORM_BOUNDARY_VIOLATION.SQL_LITERAL;
  return undefined;
}

export function inspectOrmBoundary(source: OrmBoundarySource): OrmBoundaryViolation[] {
  if (isExcluded(source.path)) return [];
  const sourceFile = ts.createSourceFile(
    source.path,
    source.source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind[ORM_BOUNDARY_SOURCE_KIND],
  );
  const violations: OrmBoundaryViolation[] = [];
  const visit = (node: ts.Node): void => {
    const kind = classifyNode(node);
    if (kind !== undefined) {
      violations.push(violation(source, sourceFile, node, kind));
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return violations;
}

export function inspectOrmBoundaryTree(repoRoot: string): OrmBoundaryInventory {
  const violations = readCheckedSources(repoRoot)
    .filter((source) => source.path.startsWith(TYPESCRIPT_SOURCE_ROOT_PREFIX))
    .filter((source) => source.path.endsWith(SOURCE_FILE_SUFFIX.TYPESCRIPT))
    .flatMap(inspectOrmBoundary)
    .sort((left, right) => left.path.localeCompare(right.path)
      || left.line - right.line
      || left.column - right.column
      || left.kind.localeCompare(right.kind));
  const digest = sourceInventoryDigest(violations.map((item) => item.fingerprint));
  return { count: violations.length, digest, violations };
}

export function evaluateOrmBoundaryBaseline(
  inventory: OrmBoundaryInventory,
  baseline: OrmBoundaryBaseline | undefined,
): OrmBoundaryBaselineEvaluation {
  return evaluateSourceBaseline('ORM', inventory, baseline);
}
