export interface SprintCreateOptions {
  goal: string;
  budget: number;
  wip?: number;
}

export interface SprintSummary {
  id: string;
  goal: string;
  budgetCap: number;
  spent: number;
  wipLimit: number | null;
  state: string;
  createdAt: string;
  closedAt: string | null;
  tasks: Array<{ id: string; status: string; order: number }>;
}
