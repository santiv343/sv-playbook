import type { BoardStatus } from '../status/status.types.js';
import type { WorkflowDashboard, WorkflowRunView } from './observability.types.js';

export interface HumanIntakeRequest {
  message: string;
  requestedBy: string;
}

export interface HumanIntakeRuntimeState {
  board: BoardStatus;
  workflow: WorkflowDashboard;
  observedAt: string;
}

export interface HumanIntakeResult {
  workflow: WorkflowRunView;
}
