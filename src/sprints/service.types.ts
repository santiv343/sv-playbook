export interface SprintCreateOptions {
  goal: string;
  budget: number;
  wip?: number;
}

// `spent` es DERIVADO (suma de task_costs, ver recordTaskCost en
// sprints/service.ts), no una columna propia de sprints — SprintSummary es
// una proyección de lectura que combina la fila real con ese agregado y la
// lista de tasks asignadas, para no requerir 3 queries separadas del lado
// del consumidor (CLI `sprint show`).
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
