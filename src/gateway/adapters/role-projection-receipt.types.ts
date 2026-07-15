export interface RoleProjectionReceipt {
  readonly id: string;
  readonly adapterId: string;
  readonly catalogVersion: number;
  readonly catalogDigest: string;
  readonly profileDigest: string;
  readonly artifactDigest: string;
  readonly createdAt: string;
}
