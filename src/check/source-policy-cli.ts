import { fileURLToPath } from 'node:url';
import { EXIT } from '../cli/command.constants.js';
import { loadConfig } from '../config.js';
import { canonicalJson } from '../context/digest.js';
import { EMPTY_SIZE } from '../platform.constants.js';
import { evaluateDuplicateStringBaseline, inspectDuplicateStringTree } from './duplicate-string.js';
import { evaluateLiteralComparisonBaseline, inspectLiteralComparisonTree } from './literal-comparison.js';
import { evaluateOrmBoundaryBaseline, inspectOrmBoundaryTree } from './orm-boundary.js';
import { inspectSuggestedCommandTree } from './suggested-command.js';
import { SOURCE_BASELINE_STATUS } from './source-baseline.constants.js';

// El punto de entrada real de `npm run verify` para los 3 gates de deuda
// monotónica (orm-boundary, literal-comparison, duplicate-string) + el gate
// de comandos sugeridos (sin baseline — cualquier violación es roja
// siempre, no hay deuda tolerada ahí). `valid` exige los 3 baselines en
// MATCH exacto (ni más ni menos deuda que la congelada) — confirma en
// código lo que F-011 (findings.md, retirado) tuvo que redescubrir con grep.
const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const config = loadConfig(REPO_ROOT);
const ormInventory = inspectOrmBoundaryTree(REPO_ROOT);
const literalInventory = inspectLiteralComparisonTree(REPO_ROOT);
const duplicateStringInventory = inspectDuplicateStringTree(REPO_ROOT);
const orm = evaluateOrmBoundaryBaseline(ormInventory, config.baseline?.ormApplicationSql);
const literalComparisons = evaluateLiteralComparisonBaseline(
  literalInventory,
  config.baseline?.literalComparisons,
);
const duplicateStrings = evaluateDuplicateStringBaseline(
  duplicateStringInventory,
  config.baseline?.duplicateStrings,
);
const suggestedCommands = inspectSuggestedCommandTree(REPO_ROOT);
const valid = orm.status === SOURCE_BASELINE_STATUS.MATCH
  && literalComparisons.status === SOURCE_BASELINE_STATUS.MATCH
  && duplicateStrings.status === SOURCE_BASELINE_STATUS.MATCH
  && suggestedCommands.count === EMPTY_SIZE;

process.stdout.write(`${canonicalJson({
  valid,
  orm: { ...orm, count: ormInventory.count, digest: ormInventory.digest },
  literalComparisons: {
    ...literalComparisons,
    count: literalInventory.count,
    digest: literalInventory.digest,
  },
  duplicateStrings: {
    ...duplicateStrings,
    count: duplicateStringInventory.count,
    digest: duplicateStringInventory.digest,
  },
  suggestedCommands: {
    valid: suggestedCommands.count === EMPTY_SIZE,
    count: suggestedCommands.count,
    violations: suggestedCommands.violations,
  },
})}\n`);
if (!valid) process.exitCode = EXIT.GATE_FAIL;
