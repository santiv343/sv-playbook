import type { RolePolicyInput } from './catalog.types.js';

export interface BundledRoleDefinition {
  readonly id: string;
  readonly mission: string;
  readonly exclusiveJudgment: string;
  readonly capabilityRequestClasses: readonly string[];
  readonly policy: Omit<RolePolicyInput, 'roleId'>;
}

export interface BundledRoleHandoff {
  readonly sourceRoleId: string;
  readonly targetRoleId: string;
}

export interface BundledRoleProfile {
  readonly id: string;
  readonly entryRoleId: string;
  readonly artifactContractRef: string;
  readonly modelCapabilityId: string;
  readonly roles: readonly BundledRoleDefinition[];
  readonly handoffs: readonly BundledRoleHandoff[];
}
