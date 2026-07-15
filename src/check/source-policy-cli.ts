import { fileURLToPath } from 'node:url';
import { EXIT } from '../cli/command.constants.js';
import { loadConfig } from '../config.js';
import { canonicalJson } from '../context/digest.js';
import { evaluateDuplicateStringBaseline, inspectDuplicateStringTree } from './duplicate-string.js';
import { evaluateLiteralComparisonBaseline, inspectLiteralComparisonTree } from './literal-comparison.js';
import { evaluateOrmBoundaryBaseline, inspectOrmBoundaryTree } from './orm-boundary.js';
import { SOURCE_BASELINE_STATUS } from './source-baseline.constants.js';

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
const valid = orm.status === SOURCE_BASELINE_STATUS.MATCH
  && literalComparisons.status === SOURCE_BASELINE_STATUS.MATCH
  && duplicateStrings.status === SOURCE_BASELINE_STATUS.MATCH;

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
})}\n`);
if (!valid) process.exitCode = EXIT.GATE_FAIL;
