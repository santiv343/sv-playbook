export type Tier = 'TIER-1' | 'TIER-2' | 'TIER-3';
export type Autonomy = 'strict' | 'standard' | 'high';

export interface PlaybookConfig {
  productName: string;
  chatLanguage: string;
  tier: Tier;
  verifyCommand: string;
  autonomy: Autonomy;
}
