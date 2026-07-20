// "Closure" acá significa: todo rol del catálogo que un adapter proyecta a
// su propia config (agentIds) tiene que tener representación completa —
// checkCatalogClosure (catalog-closure.ts) es lo que decide si algo quedó
// afuera. AdapterRoleProjection es el resultado CRUDO por adapter (usado
// tanto para el estado persistido como para el "efectivo" recompilado, ver
// role-projection-registry.ts); CatalogClosureCheck es el veredicto final
// ya reducido a valid/violations.
export interface AdapterRoleProjection {
  adapterId: string;
  agentIds: readonly string[];
  violations?: readonly string[];
}

export interface CatalogClosureCheck {
  valid: boolean;
  violations: readonly string[];
}
