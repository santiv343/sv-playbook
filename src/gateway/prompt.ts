import type { Store } from '../db/store.types.js';
import { numberColumn, stringColumn } from '../db/rows.js';
import { canonicalJson, digest } from '../context/digest.js';
import { ContextError } from '../context/context.errors.js';
import { resolvedArtifactSchema } from '../contracts/artifacts.js';
import type { RunSpec } from './gateway.types.js';
import { RUN_PROMPT_INSTRUCTION, RUN_PROMPT_PROTOCOL, RUN_SPEC_ERROR } from './gateway.constants.js';
import { resolveWorkDefinition } from '../tasks/work-definitions.js';

export function renderRunPrompt(store: Store, runSpec: RunSpec): string {
  const rows = store.db.prepare(`SELECT i.id, i.version, i.kind, i.semantic_key, i.body
    FROM context_pack_items pi
    JOIN context_items i ON i.id = pi.item_id AND i.version = pi.item_version
    WHERE pi.pack_id = ? ORDER BY pi.ordinal`).all(runSpec.contextPackId);
  const items = rows.map((row) => ({
    ref: `${stringColumn(row, 'id')}@${numberColumn(row, 'version')}`,
    kind: stringColumn(row, 'kind'),
    semanticKey: stringColumn(row, 'semantic_key'),
    body: stringColumn(row, 'body'),
  }));
  const inputArtifact = runSpec.inputArtifactId === null ? null : (() => {
    const row = store.db.prepare('SELECT id, contract_ref, value_json, value_digest FROM workflow_artifacts WHERE id = ?')
      .get(runSpec.inputArtifactId);
    if (row === undefined) throw new ContextError(RUN_SPEC_ERROR.MISSING_INPUT_ARTIFACT, `missing input artifact: ${runSpec.inputArtifactId}`);
    const value: unknown = JSON.parse(stringColumn(row, 'value_json'));
    return {
      id: stringColumn(row, 'id'),
      contractRef: stringColumn(row, 'contract_ref'),
      value,
      digest: stringColumn(row, 'value_digest'),
    };
  })();
  const workDefinition = runSpec.workDefinitionRef === null ? null : (() => {
    const stored = resolveWorkDefinition(store, runSpec.workDefinitionRef);
    if (stored.digest !== runSpec.workDefinitionRef.digest) {
      throw new ContextError(RUN_SPEC_ERROR.INVALID, `work definition digest mismatch: ${stored.packetId}@${stored.version}`);
    }
    return { reference: stored.reference, value: stored.value };
  })();
  const outputContractSchema = resolvedArtifactSchema(store, runSpec.outputContractRef);
  return canonicalJson({
    protocol: RUN_PROMPT_PROTOCOL,
    runSpec: {
      id: runSpec.id,
      role: runSpec.roleId,
      phase: runSpec.phase,
      workDefinitionRef: runSpec.workDefinitionRef,
      workflowEffectRef: runSpec.workflowEffectRef,
      contextPackId: runSpec.contextPackId,
      outputContractRef: runSpec.outputContractRef,
      specDigest: runSpec.specDigest,
    },
    instruction: RUN_PROMPT_INSTRUCTION,
    outputContract: {
      ref: runSpec.outputContractRef,
      schemaDigest: digest(outputContractSchema),
      schema: outputContractSchema,
    },
    inputArtifact,
    workDefinition,
    items,
  });
}
