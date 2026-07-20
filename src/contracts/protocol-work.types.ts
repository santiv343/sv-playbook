export interface ProtocolRoleFact {
  roleId: string;
  contextRef: string;
  charter: string;
  inputContractRef: string;
  outputContractRef: string;
  minimumModelCapability: string;
  responsibilities: readonly string[];
  responsibilityDescriptions: Readonly<Record<string, string>>;
  prohibitions: readonly string[];
  selfCorrectionMode: string;
  selfCorrectionScopes: readonly string[];
  stopConditions: readonly string[];
  escalationClasses: readonly string[];
}

export interface ProtocolHandoffFact {
  sourceRoleId: string;
  targetRoleId: string;
  artifactContractRef: string;
}

export interface ProtocolContractFact {
  ref: string;
  inputForRoles: readonly string[];
  outputFromRoles: readonly string[];
  handoffs: readonly ProtocolHandoffFact[];
}

export interface ProtocolSharedSchemaFact {
  ref: string;
  schemaId: string;
  schemaDigest: string;
  schema: Readonly<Record<string, unknown>>;
  metadataSchemaRef: string;
  metadataDigest: string;
  definitions: readonly string[];
}

export interface ProtocolProposalRules {
  exactContractRefs: readonly string[];
  generatedSchemaDialect: string;
  generatedIdPrefix: string;
  allowedSharedRefs: readonly string[];
  allowedSharedDefinitions: readonly string[];
  forbiddenAgentKeywords: readonly string[];
  propertyNamePattern: string;
  minimumValidExamplesPerContract: number;
  minimumInvalidExamplesPerContract: number;
  generatedScaffolds: readonly ProtocolContractScaffold[];
}

export interface ProtocolContractScaffold {
  ref: string;
  properties: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  required: readonly string[];
  exampleValues: Readonly<Record<string, unknown>>;
}

export interface UnsupportedEscalationFact {
  roleId: string;
  classId: string;
}

export interface ProtocolSourceReconciliation {
  allowedEscalationClasses: readonly string[];
  unsupportedEscalations: readonly UnsupportedEscalationFact[];
}

// "Protocol" acá es un dominio propio (no confundir con task packets):
// modela el proceso de EVOLUCIONAR el propio catálogo de roles/contratos —
// un agente propone (ProtocolSemanticProposal), el sistema valida contra
// proposalRules (nombres exactos, dialecto de schema, keywords prohibidas)
// y sólo entonces se materializa como artifact contract real. packetDigest
// ata la propuesta a una foto puntual del catálogo — si el catálogo cambió
// mientras se armaba la propuesta, el digest no matchea y se rechaza.
export interface ProtocolWorkPacket {
  id: string;
  schemaVersion: number;
  sourceDigest: string;
  packetDigest: string;
  roles: readonly ProtocolRoleFact[];
  contracts: readonly ProtocolContractFact[];
  runtimeResponsibilities: readonly string[];
  sharedSchemas: readonly ProtocolSharedSchemaFact[];
  sourceReconciliation: ProtocolSourceReconciliation;
  proposalRules: ProtocolProposalRules;
}

export interface ProtocolWorkInspection {
  packet: ProtocolWorkPacket;
  valid: boolean;
  violations: readonly string[];
}

export interface ProtocolSemanticInvariant {
  id: string;
  statement: string;
  evidenceRequirement: string;
}

export interface ProtocolMechanizationCandidate {
  statement: string;
  reasonNotCurrentlyDerivable: string;
}

export interface ProtocolContractFragment {
  ref: string;
  purpose: string;
  payloadSchema: Readonly<Record<string, unknown>>;
  semanticInvariants: readonly ProtocolSemanticInvariant[];
  mechanizationCandidates: readonly ProtocolMechanizationCandidate[];
  validExamples: readonly unknown[];
  invalidExamples: readonly unknown[];
}

export interface ProtocolSemanticProposal {
  workPacketId: string;
  workPacketDigest: string;
  contracts: readonly ProtocolContractFragment[];
}

export interface ProtocolProposalCheck {
  valid: boolean;
  violations: readonly string[];
  generatedContracts: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
}

export interface ProtocolProposalEvaluation extends ProtocolProposalCheck {
  proposalId: string;
  proposalDigest: string;
}

export interface ProtocolProposalBatchEvaluation extends ProtocolProposalCheck {
  batchId: string;
  batchDigest: string;
}

export interface ProtocolSupportInput {
  schema: Readonly<Record<string, unknown>>;
  metadataSchema: Readonly<Record<string, unknown>>;
  metadata: Readonly<Record<string, unknown>>;
}
