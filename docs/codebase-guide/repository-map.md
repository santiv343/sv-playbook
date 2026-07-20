# Mapa del repositorio

> Árbol simplificado + responsabilidad de cada carpeta. Verificado listando
> archivos reales de cada dominio (no es una descripción de memoria).
> Fecha: 2026-07-20.

## Árbol de primer nivel

```
sv-playbook/
├── bin/sv-playbook.js        # entry point ejecutable
├── src/                       # todo el código fuente (ver detalle abajo)
├── dist/                      # compilado — es lo que realmente corre
├── content/                   # markdown "fuente de verdad": principios, roles, taste
├── docs/                      # documentación viva del propio proyecto
│   ├── codebase-guide/        # ESTA guía
│   ├── superpowers/plans/     # planes de implementación (formato RED-first)
│   ├── superpowers/specs/     # specs de diseño aprobados
│   └── backlog.md             # registro vivo de ideas/incidentes (119 entradas)
├── scripts/                   # bootstrap/build (.mjs, corren sobre dist/)
└── .github/workflows/ci.yml   # CI: verify en ubuntu-latest + windows-latest
```

## `src/` — los 24 dominios

Convención por dominio (no todos tienen los 5 archivos, según necesidad):
`<dominio>.ts` (lógica) · `.types.ts` · `.constants.ts` · `.errors.ts` ·
`schema.constants.ts` (si tiene tablas propias) · `.test.ts` al lado.

| Carpeta | Archivos | Responsabilidad (verificada) |
|---|---|---|
| `cli/` | 12 + 45 comandos | Despachador (`main.ts`, `registry.ts`), contrato `Command`, y cada comando individual en `cli/commands/*.ts` |
| `db/` | 44 | Acceso a SQLite, schema completo, migraciones versionadas, ubicación externa del store (`store-location.ts`), locks/pragmas, backup/restore |
| `orchestration/` | 30 | El motor de **workflows durables** multi-paso: coordinador (`coordinator.ts`), runtime, cola de reintentos (`workflow-queue.ts`), ejecutores de efectos, intake humano — es la maquinaria detrás de los pipelines que sobreviven un crash del proceso observador |
| `check/` | 30 | Los gates mecánicos: duplicación de strings, comparaciones literales, secrets, uso de comandos, estructura de packets, drift de `AGENTS.md`/`CLAUDE.md` |
| `roles/` | 25 | Catálogo de 9 roles (human-interface, planner, implementer, reviewer, etc.), su bootstrap desde el bundle, proyección a formato de cada adapter |
| `tasks/` | 22 | El núcleo del dominio: `packets` (unidad de trabajo), su máquina de estados, dependencias, leases, sesiones |
| `contracts/` | 21 | Contratos tipados que los artifacts/outputs de agentes deben cumplir (validación de "envelope" de salida) |
| `gateway/` | 17 | Integración con agentes de IA externos: adapters (hoy sólo `opencode`), observación de runs, retry, duración máxima |
| `promotion/` | 12 | El flujo "candidato de review aprobado → integración real a `main`" — la única puerta a `done` |
| `review/` | 10 | Preflight: chequeos mecánicos antes de que un candidato llegue a revisión (rama correcta, worktree limpio, write_set respetado) |
| `adopt/` | 10 | Adopción de un proyecto ya existente (inventario, gaps, scaffold, inferencia de taste) — para instalar sv-playbook sobre código que ya existe |
| `schema/` | 9 | Definiciones de JSON Schema (Ajv) para validación de config/contratos |
| `daemon/` | 9 | El proceso de escritor único: lock exclusivo, forwarding HTTP, lifecycle |
| `context/` | 9 | Compilación de "context packs" (principios + taste + charter de rol) para el cold-start de agentes |
| `verification/` | 5 | El comando `verify`: orquesta typecheck + lint + test + gates propios en una sola corrida |
| `packets/` | 4 | Parseo/generación del documento de un packet (frontmatter + body) |
| `workspace/` | 3 | Clasificación de qué archivos de un worktree están "sucios" y por qué |
| `status/` | 3 | Lectura del estado del tablero (board), leases, backups — alimenta `status`/`doctor` |
| `sprints/` | 3 | Agrupación de packets en sprints (goal, budget, wip limit) |
| `serve/` | 3 | La consola HTTP operativa (`:3131`) — server + assets estáticos |
| `reconcile/` | 3 | Reconciliación entre el estado declarado y el estado real observado |
| `enforcement/` | 3 | Verificación de conformidad de un candidato/módulo contra reglas declaradas |
| `runtime/` | 2 | Contexto de ejecución (cwd, sessionId) vía `AsyncLocalStorage` — necesario porque el daemon reenvía comandos de otros cwd |
| `redteam/` | 2 (+ tests) | Tests de resiliencia deliberados (matar el daemon con SIGKILL y verificar recuperación, etc.) |
| `constitution/` | 1 | Visión/producto/principios de la instancia, como artifact versionado |
| `docs/` | 0 (sólo tests) | *(a confirmar en una etapa posterior qué contiene exactamente)* |

## `content/` — la fuente de verdad en markdown

```
content/
├── principles.md       # los 16 PRINCIPLE-XXX del proyecto (PRINCIPLE-016 agregado 2026-07-20)
├── taste/               # HJ-001..021, juicio humano capturado
├── roles/                # (mayormente retirado — los roles viven en DB ahora)
├── review.md             # checklist de reviewer
├── rubric.md              # rúbrica de aceptación
├── dispatch/              # prompts/formato para despachar workers
├── skills/                # skills disponibles para agentes
└── cli.md                 # (recortado — el CLI es autodescubrible ahora)
```

## Convenciones que ya están mecanizadas (no hace falta re-descubrirlas)

- **`store.orm` siempre**: gate de lint cuenta violaciones de SQL crudo fuera de `src/db/`.
- **`max-lines: 350` por archivo**: gate de lint, fuerza extracción a módulos cuando un archivo crece.
- **Sin comparación de string literal**: gate de lint (`playbook/no-string-literal-comparison`) exige comparar contra constantes nombradas.
- **`Command.usage` obligatorio**: todo comando del CLI debe declarar su string de uso — gate mecánico (`check command-usage`).

## Fuentes verificadas

Listado real de archivos por dominio (`ls src/<dominio>`), cruzado contra
lecturas puntuales de los archivos principales de cada uno. La fila de
`docs/` (0 archivos no-test) y algunas responsabilidades de dominios chicos
(`reconcile`, `enforcement`, `workspace`) están basadas en el nombre de
archivo y una lectura superficial, no en lectura completa — se profundizan
en las etapas donde correspondan.

## Progreso de comentarios en español (código fuente real)

A diferencia de esta guía (que documenta desde afuera), también se están
agregando comentarios explicativos DENTRO del código fuente (`src/`), en
español, explicando el "por qué" de cada pieza no obvia. Estado a
2026-07-20: **~96 archivos comentados** de los ~367 no-test totales
(`docs(comments): ...` en el historial de git de la rama de esta guía).
Prioridad de cobertura: primero los archivos con lógica real (funciones con
invariantes no obvias, compare-and-swap, migraciones), después
`.constants.ts`/`.types.ts` sólo cuando agregan contexto que no está ya en
su archivo `.ts` hermano — evitando comentarios redundantes que sólo
repiten el nombre del tipo.
