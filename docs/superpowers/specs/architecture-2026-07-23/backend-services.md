# Capas de servicio nuevas/completadas

← [índice](README.md) · relacionado: [backend-api.md](backend-api.md) ·
fuente: `arquitectura-simplificacion.md` D6/E2/E3/E4

`cli/` (5200L) es en su gran mayoría wrapper delgado sobre capas de
servicio que ya existen (`tasks/service.ts`, `gateway/`, `contracts/`) —
desaparece sin pérdida bajo el pivote, las rutas REST nuevas llaman
directo a esas mismas funciones. Tres excepciones puntuales tienen lógica
de dominio real que hoy **sólo** existe dentro de un comando CLI. Estas
tres son el único trabajo de "rescate" real que el port necesita antes de
que `cli/` pueda borrarse sin pérdida.

## 1. `src/decisions/service.ts` (no existe hoy)

Hoy vive entero en `cli/commands/decision.ts`, sin capa de servicio. Firma
exacta a crear (mecánica idéntica a la que ya existe ahí — el
`nextDecisionId`, el INSERT/UPDATE sobre `decisions` — se mueve tal cual,
sin rediseño):

```ts
export function askDecision(store: Store, question: string, packetId: string | null): string;
export function answerDecision(store: Store, id: string, answer: string): void;
export function listDecisions(store: Store, options?: { pendingOnly?: boolean }): DecisionRow[];
export function getDecision(store: Store, id: string): DecisionRow | undefined;
```

## 2. Tres mutators nuevos en `sprints/service.ts` (ya existe, cubre casi todo)

```ts
export function updateSprintGoal(store: Store, sprintId: string, goal: string): void;
export function updateSprintBudget(store: Store, sprintId: string, budgetCap: number): void;
export function updateSprintWipLimit(store: Store, sprintId: string, wipLimit: number): void;
```

Cada uno reusa `ensureSprintOpen` (ya existe en `cli/commands/sprint.ts`,
se mueve junto) antes del `UPDATE` — mismo SQL que ya corre hoy, sólo
cambia de capa.

## 3. `ReconcilerExecutor` para el backend

La interfaz ya existe (`reconcile/reconcile.types.ts`):

```ts
interface ReconcilerExecutor {
  updateBranch(pr: string): void;
  taskClose(packetId: string, pr: string): void;
  createBackup(): void;
  recordEvent(event: ReconcilerEvent): void;
}
```

Sólo falta una implementación nueva (`src/reconcile/backend-executor.ts` o
similar) que reemplace la que hoy vive inline en `cli/commands/reconcile.ts`
— misma lógica de decisión SAFE/UNSAFE, sin cambios. Ver
`mapa-flujo-app.md` § Tramo 17 para el detalle línea a línea de
`reconcile()` y por qué sólo filas `SAFE` se aplican solas.
