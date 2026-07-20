import type { RolePolicyInput } from './catalog.types.js';

// Tipos de INPUT para construir el catálogo bundled (bundled-profile.constants.ts)
// — más livianos que RoleCatalogEntry (roles/catalog.types.ts): policy
// omite roleId (se infiere de dónde se usa), no incluye contextItemRef ni
// digests todavía porque eso se resuelve recién al bootstrapear
// (bundled-profile-bootstrap.ts).
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
