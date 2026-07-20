import { and, asc, eq } from 'drizzle-orm';
import { ARTIFACT_CONTRACT_STATUS } from '../contracts/artifact.constants.js';
import type { Store } from '../db/store.types.js';
import { WORKFLOW_DEFINITION_STATUS } from './orchestration.constants.js';
import { artifactContracts, workflowDefinitions, workflowDefinitionSteps } from './schema.constants.js';
import type { WorkflowLaunchDefinition } from './launch-catalog.types.js';

function parseSchema(value: string, contractRef: string): Readonly<Record<string, unknown>> {
  const parsed: unknown = JSON.parse(value);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new TypeError(`artifact contract ${contractRef} schema must be an object`);
  }
  return Object.fromEntries(Object.entries(parsed));
}

// El "catálogo de lanzamiento" son las definiciones de workflow que se
// pueden INICIAR desde afuera (p.ej. desde la consola operativa) — el JOIN
// triple filtra a definiciones ACTIVE cuyo primer step (startStepKey) tiene
// un contrato de input ACTIVO y resuelve su JSON Schema real, así el
// consumidor (la UI de serve/) puede armar un formulario de input válido
// sin adivinar qué campos espera cada workflow.
export function readWorkflowLaunchCatalog(store: Store): WorkflowLaunchDefinition[] {
  return store.orm.select({
    id: workflowDefinitions.id,
    version: workflowDefinitions.version,
    startStepKey: workflowDefinitions.startStepKey,
    inputContractRef: workflowDefinitionSteps.inputContractRef,
    schemaJson: artifactContracts.schemaJson,
  }).from(workflowDefinitions)
    .innerJoin(workflowDefinitionSteps, and(
      eq(workflowDefinitionSteps.definitionId, workflowDefinitions.id),
      eq(workflowDefinitionSteps.definitionVersion, workflowDefinitions.version),
      eq(workflowDefinitionSteps.stepKey, workflowDefinitions.startStepKey),
    ))
    .innerJoin(artifactContracts, eq(artifactContracts.ref, workflowDefinitionSteps.inputContractRef))
    .where(and(
      eq(workflowDefinitions.status, WORKFLOW_DEFINITION_STATUS.ACTIVE),
      eq(artifactContracts.status, ARTIFACT_CONTRACT_STATUS.ACTIVE),
    ))
    .orderBy(asc(workflowDefinitions.id), asc(workflowDefinitions.version)).all()
    .map(({ schemaJson, ...definition }) => ({
      ...definition,
      inputSchema: parseSchema(schemaJson, definition.inputContractRef),
    }));
}
