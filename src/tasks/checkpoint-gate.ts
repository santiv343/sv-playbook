import { eq } from 'drizzle-orm';
import type { Store } from '../db/store.types.js';
import { loadConfig } from '../config.js';
import { parseJson } from '../schema/core.js';
import { detectNovelty } from './novelty.js';
import { CheckpointPendingDecisionError } from './service.errors.js';
import { decisions, packetDefinitions, packets } from './schema.constants.js';
import { WorkDefinitionValueSchema } from './work-definition.schema.constants.js';

function writeSetFromDefinitionJson(definitionJson: string): string[] {
  return WorkDefinitionValueSchema.parse(parseJson(definitionJson)).writeSet;
}

export function assertCheckpointClear(store: Store, packetId: string): void {
  const config = loadConfig(store.repoRoot).tasks.complexityCheckpoint;
  if (!config.enabled) return;

  const packet = store.orm.select().from(packets).where(eq(packets.id, packetId)).get();
  if (packet === undefined) return;

  const allDefinitions = store.orm.select().from(packetDefinitions).all();
  const priorWriteSets = allDefinitions
    .filter((row) => row.packetId !== packetId)
    .map((row) => writeSetFromDefinitionJson(row.definitionJson));
  const currentDefinition = allDefinitions
    .filter((row) => row.packetId === packetId)
    .sort((a, b) => b.version - a.version)[0];
  if (currentDefinition === undefined) return;
  const candidateWriteSet = writeSetFromDefinitionJson(currentDefinition.definitionJson);

  const novelty = detectNovelty({ candidateWriteSet, priorWriteSets });
  const typeMatch = config.requireDecisionForTypes.includes(packet.type);
  const pathMatch = config.requireDecisionForPaths.some((glob) => candidateWriteSet.includes(glob));

  if (!novelty.isNovel && !typeMatch && !pathMatch) return;

  const linkedDecisions = store.orm.select().from(decisions).where(eq(decisions.packetId, packetId)).all();
  const allAnsweredAndCurrent = Boolean(linkedDecisions.length) && linkedDecisions.every(
    (d) => d.answer !== null && d.answeredAgainstVersion === currentDefinition.version,
  );
  if (!allAnsweredAndCurrent) {
    throw new CheckpointPendingDecisionError(packetId, novelty.newPatterns);
  }
}
