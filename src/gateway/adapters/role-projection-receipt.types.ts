// La identidad de un receipt es el conjunto completo de estos 6 campos —
// recordRoleProjectionReceipts reutiliza uno existente si TODOS matchean,
// nunca crea un duplicado por contenido idéntico.
export interface RoleProjectionReceipt {
  readonly id: string;
  readonly adapterId: string;
  readonly catalogVersion: number;
  readonly catalogDigest: string;
  readonly profileDigest: string;
  readonly artifactDigest: string;
  readonly createdAt: string;
}
