import type { AdapterConfig } from './opencode.constants.js';

export interface OpenCodeServerLauncher {
  launch(config: AdapterConfig): void;
}
