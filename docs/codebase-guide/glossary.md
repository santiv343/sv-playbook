# Glosario

> Vocabulario del dominio y del código. Se amplía a medida que avanzamos
> por las etapas — esta primera versión cubre lo necesario para la Etapa 1
> y 2. Fuente cruzada con `docs/anatomy.md` (glosario previo ya verificado).

## Conceptos del negocio / dominio

| Término | Qué es | Dónde vive en código |
|---|---|---|
| **packet** | La unidad de trabajo — un "ticket" validado por máquina, con qué hacer, qué archivos puede tocar (`write_set`) y cuándo frenar | `src/tasks/`, tabla `packets` |
| **write_set** | Lista de globs que un packet autoriza a modificar — su "radio de explosión" | `src/tasks/service.ts`, campo `write_set` |
| **lease** | Reserva con TTL que un worker toma sobre un packet activo; evita trabajo duplicado, expira sola si el worker muere | `src/tasks/`, tabla `leases` |
| **RED test** | El test que se escribe primero y falla antes de implementar — demuestra que el problema existe | disciplina del proyecto (PRINCIPLE-002), no una tabla |
| **verify** | El comando que corre typecheck + lint + test + gates propios de una sola vez | `src/verification/`, script `npm run verify` |
| **gate / rail** | Una regla mecanizada por el CLI — no depende de que alguien la recuerde | patrón transversal, ej. `src/check/` |
| **dispatch / run** | El acto de lanzar un agente a ejecutar algo, y esa ejecución en sí | `src/gateway/`, tabla `run_specs` |
| **harness / adapter** | La herramienta de agente concreta (OpenCode, Claude Code, Codex) y el código que le habla | `src/gateway/adapters/` |
| **gateway** | La parte del sistema que lanza runs vía un adapter y los observa hasta que terminan | `src/gateway/` |
| **promotion** | La única puerta a `done` — re-verifica todo en limpio antes de cerrar la tarea | `src/promotion/` |
| **store** (`.svp/` / externo) | La base SQLite local con el estado vivo, hoy ubicada fuera del árbol git | `src/db/` |
| **daemon** | El proceso de escritor único ("single blessed writer") — toma lock exclusivo del store | `src/daemon/` |
| **candidato de review** | Snapshot inmutable de un packet listo para revisión, con SHA/branch capturados por el CLI (no declarados por el agente) | `src/review/`, `src/promotion/` |
| **context pack** | El conjunto de principios/taste/charter de rol compilado para un rol+fase específicos, con digest reproducible | `src/context/` |
| **checkpoint de complejidad** | Gate de aprobación humana antes de que un packet toque territorio arquitectónico nuevo | ver `docs/superpowers/specs/2026-07-16-complexity-checkpoint-design.md` |

## Roles (agentes con responsabilidad definida)

9 roles definidos en `src/roles/bundled-profile.constants.ts`:
`human-interface`, `planner`, `refuter`, `delivery-orchestrator`,
`implementer`, `reviewer`, `advisor`, `arbiter`, `investigator`.

## Acrónimos y nombres internos

| Término | Significado |
|---|---|
| `EXIT` | Los 4 exit codes estandarizados del CLI: `OK=0`, `GATE_FAIL=1`, `USAGE=2`, `SYSTEM=3` (`src/cli/command.constants.ts`) |
| `Io` | Interfaz mínima de entrada/salida que todo comando recibe (`out(line)`, `err(line)`) — permite testear comandos sin tocar stdout real |
| `Command` | El contrato que implementa cada comando del CLI (`src/cli/command.types.ts`) |
| `ContextError` / `LifecycleError` / etc. | Clases de error tipadas por dominio, ~10 en total |
| `SVP_DIR` | El nombre de la carpeta `.svp/` (aún usada para el lock/token del daemon, aunque la DB en sí se mudó afuera) |
| `IDEA-XXX` | Identificador de una entrada en `docs/backlog.md` |
| `PRINCIPLE-XXX` | Uno de los 15 principios de diseño del proyecto, en `content/principles.md` |
| `HJ-XXX` | "Human Judgment" — entradas de taste/criterio humano capturado, en `content/taste/human.md` |

## Términos técnicos específicos del proyecto

| Término | Qué significa acá |
|---|---|
| **fail-closed** | Ante la duda, rechazar — no aceptar un valor no verificado |
| **terminal-first** | Patrón del gateway: consultar el estado durable (SQLite) antes que la red, para evitar handles de red colgados |
| **idempotencia por identidad** | Volver a "preparar" un run con la misma identidad `(dispatchRef, rol, fase)` devuelve el mismo run, nunca duplica |
| **blast radius** | El alcance de archivos que un packet puede tocar — sinónimo de `write_set` |
| **single blessed writer** | El patrón de un único proceso (el daemon) con derecho exclusivo de escritura sobre el store |

## Pendiente de ampliar

Este glosario crece con cada etapa — términos específicos de persistencia,
daemon, gateway y promotion se agregan cuando se estudian esos flujos en
profundidad.
