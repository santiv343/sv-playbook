import { RESPONSIBILITY_CLASSIFICATION, SELF_CORRECTION_MODE } from './role.constants.js';
import { ROLE_CATALOG_PROFILE_SOURCE } from './catalog.constants.js';

export type ResponsibilityClassification = typeof RESPONSIBILITY_CLASSIFICATION[keyof typeof RESPONSIBILITY_CLASSIFICATION];
export type SelfCorrectionMode = typeof SELF_CORRECTION_MODE[keyof typeof SELF_CORRECTION_MODE];

export interface ResponsibilityInput {
  id: string;
  classification: ResponsibilityClassification;
  description: string;
}

export interface RoleContractInput {
  roleId: string;
  mission: string;
  contextItemRef: string;
  inputContractRef: string;
  outputContractRef: string;
  minimumModelCapability: string;
  exclusiveJudgments: readonly string[];
  capabilityRequestClasses: readonly string[];
}

export interface RoleHandoffInput {
  sourceRoleId: string;
  targetRoleId: string;
  artifactContractRef: string;
}

export interface RoleEscalationInput {
  roleId: string;
  classId: string;
}

export interface RolePolicyInput {
  roleId: string;
  prohibitions: readonly string[];
  selfCorrectionMode: SelfCorrectionMode;
  selfCorrectionScopes: readonly string[];
  stopConditions: readonly string[];
  escalationClasses: readonly string[];
}

export interface ModelCapabilityInput {
  id: string;
  description: string;
}

export type RoleCatalogProfileSource = typeof ROLE_CATALOG_PROFILE_SOURCE[keyof typeof ROLE_CATALOG_PROFILE_SOURCE];

export interface RoleCatalogProfileInput {
  readonly profileId: string;
  readonly entryRoleId: string;
  readonly sourceKind: RoleCatalogProfileSource;
}

export interface RoleCatalogCheck {
  valid: boolean;
  violations: readonly string[];
}

export interface RoleCatalogEntry {
  roleId: string;
  definitionVersion: number;
  mission: string;
  required: boolean;
  inputContractRef: string;
  outputContractRef: string;
  minimumModelCapability: string;
  exclusiveJudgments: readonly string[];
  capabilityRequestClasses: readonly string[];
}
