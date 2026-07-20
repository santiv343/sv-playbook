import type { BoardStatus } from '../status/status.types.js';
import type { WorkflowDashboard, WorkflowRunView } from './observability.types.js';

// "Human intake" es el punto de entrada donde un mensaje humano libre
// (`message`) se interpreta en el contexto del estado ACTUAL del sistema
// (board + workflow dashboard, HumanIntakeRuntimeState) para decidir a qué
// workflow corresponde — es la mecanización parcial de "human-interface"
// como rol (ver bundled-profile.constants.ts): el estado runtime se le da
// ya resuelto, no tiene que ir a consultarlo por su cuenta.
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
