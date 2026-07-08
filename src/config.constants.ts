import type { PlaybookConfig } from './config.types.js';

export const DEFAULTS: PlaybookConfig = {
  productName: 'unnamed',
  chatLanguage: 'en',
  tier: 'TIER-2',
  verifyCommand: 'npm run verify',
  autonomy: 'strict',
};
