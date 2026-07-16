import type { WORK_DEFINITION_SCHEMA_VERSION } from './work-definition.constants.js';
import type { REFERENCE_KIND } from '../platform.constants.js';

export interface WorkDefinitionReference {
  kind: typeof REFERENCE_KIND.WORK_DEFINITION;
  id: string;
  version: number;
}

export interface ResolvedWorkDefinitionReference extends WorkDefinitionReference {
  digest: string;
}

export interface WorkDefinitionValue {
  schemaVersion: typeof WORK_DEFINITION_SCHEMA_VERSION;
  id: string;
  title: string;
  body: string;
  type: string;
  dependsOn: readonly string[];
  writeSet: readonly string[];
  requirements: readonly string[];
  evidenceRequired: readonly string[];
  tags: readonly string[];
}

export interface StoredWorkDefinition {
  reference: ResolvedWorkDefinitionReference;
  packetId: string;
  version: number;
  digest: string;
  value: WorkDefinitionValue;
  createdAt: string;
}
