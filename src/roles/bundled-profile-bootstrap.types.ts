import type { BUNDLED_ROLE_BOOTSTRAP_MODE } from './bundled-profile.constants.js';

export type BundledRoleBootstrapMode =
  typeof BUNDLED_ROLE_BOOTSTRAP_MODE[keyof typeof BUNDLED_ROLE_BOOTSTRAP_MODE];

export interface BundledRoleBootstrapReceipt {
  readonly profileId: string;
  readonly profileDigest: string;
  readonly catalogVersion: number;
  readonly catalogDigest: string;
  readonly createdAt: string;
}
