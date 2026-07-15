export interface AdapterRoleProjection {
  adapterId: string;
  agentIds: readonly string[];
  violations?: readonly string[];
}

export interface CatalogClosureCheck {
  valid: boolean;
  violations: readonly string[];
}
