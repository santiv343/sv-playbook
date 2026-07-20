import type { BoardStatus } from '../status/status.types.js';
import type { WorkflowDashboard } from '../orchestration/observability.types.js';
import type { PromotionDashboardItem } from '../promotion/promotion.types.js';

// OperationalDashboard es la respuesta única del endpoint principal de
// `serve` — agrupa 3 vistas de dominios distintos (packets/board,
// workflows de orchestration, y promotions) en un solo payload por
// simplicidad de la UI, aunque cada uno se lee de su propio módulo. Ver
// F-002 en findings.md: el WorkflowDashboard adentro de esto se re-envía
// completo en cada push SSE en vez de incremental por `afterSeq`.
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
