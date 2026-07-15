import type { BoardStatus } from '../status/status.types.js';
import type { WorkflowDashboard } from '../orchestration/observability.types.js';
import type { PromotionDashboardItem } from '../promotion/promotion.types.js';

export interface OperationalDashboard {
  board: BoardStatus;
  workflow: WorkflowDashboard;
  promotions: readonly PromotionDashboardItem[];
  generatedAt: string;
}

export interface OperationalServerOptions {
  refreshMs: number;
}

export interface HumanResolutionBody {
  resolvedBy: string;
  output: unknown;
}

export interface StartWorkflowBody {
  definitionId: string;
  definitionVersion?: number;
  subjectRef: string;
  requestedBy: string;
  inputContractRef: string;
  input: unknown;
}

export interface HumanIntakeBody {
  message: string;
}
