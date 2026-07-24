# Qué muere, qué se retira, qué sobrevive parcial

← [índice](README.md) · fuente: `arquitectura-simplificacion.md`
D5/D6/D7/D10/D16/D20/D25/D31/D56/D57/D58 · PRINCIPLE-007 (nada muere sin
tumba) — este documento + el tag git `arch-v1-cli-frozen` cumplen esa
función.

## Muere sin reemplazo

- **`cli/` casi entero** — wrapper delgado sobre servicios que ya
  existen; ver [backend-services.md](backend-services.md) para las 3
  excepciones que sí necesitan rescate (`decisions`, 3 mutators de
  `sprints`, executor de `reconcile`).
- **`daemon/client.ts`** (forwarding vía `spawnSync`), **`daemon.lock.ts`**
  (PID lock nonce/CAS), **`daemon.context.ts`**
  (`enforceWorkspaceBinding`/`parseExecContext`, resuelve worktree desde el
  cwd de quien llama) — resuelven un problema (muchos procesos CLI
  compitiendo) que deja de existir con un único proceso backend. La ruta
  `/api/v1/exec` (passthrough genérico de argv) se reemplaza por rutas
  REST tipadas.
- **`rebuild.ts`** y el concepto entero de "reconstruir la DB desde
  `.md` de packets" — no hay `.md` desde donde reconstruir (ver "DB como
  única fuente" abajo).
- **`contracts/protocol-*`** (~1923L, 80% de `contracts/`) —
  `protocol-proposal*`, `protocol-work*`, `protocol-reconciliation*`,
  `protocol-evolution.ts`. Ciclo propuesta→review→apply para que un
  agente evolucione el vocabulario de contratos mismo. Evidencia de
  cero-uso real: viene del commit fundacional (M0 tracer), ningún packet
  lo referencia, nada fuera de `contracts/`/`cli/commands/contract.ts` lo
  llama funcionalmente. Si algún día hace falta, se reconstruye desde una
  necesidad real — el diseño queda documentado como referencia en el
  registro de auditoría (`Dn` D10). **Trae 9 tablas de DB consigo, no 7**
  (corregido en D57 tras auditar el schema real: `artifact_contract_activations`
  y `artifact_contract_metadata` son parte del mismo cluster muerto,
  usadas exclusivamente por estos mismos archivos, sin el prefijo
  `protocol_` que las hacía fáciles de ver de un vistazo) — ver
  [data-and-migrations.md](data-and-migrations.md#auditoría-de-tablas)
  para el detalle completo de la auditoría de las 83 tablas reales de la
  DB.
- **`packets/document.ts`** (`generatePacketDocument`/
  `parsePacketDocument`, D43) — se retira entero (D58, decisión del
  founder): la conveniencia de redactar un packet en `.md` e importarlo
  no sobrevive como camino secundario. Creación de packets es
  exclusivamente vía DB/API (D22.4), sin excepción — sólo el tipo
  `PacketDefinition` sobrevive como tipo interno donde haga falta.
- **`tasks/legacy-review-verification.ts`** (32L) — código muerto
  confirmado (F-007 ya documentado por el proyecto): alcanzable sólo
  desde tests que llaman `movePacket()` directo, nunca desde el comando
  real. `legacy-review-evidence.ts` (45L) es distinto — SÍ alcanzable hoy
  como fallback real, se revisa al portar `tasks/`, no se descarta de
  entrada.
- **`describe`, `docs`, `generate-index`** — ayuda de comandos de la
  propia CLI, no tienen equivalente en un backend.

## Se retira formalmente (PRINCIPLE-015 — necesita packet de remoción propio, no borrado silencioso)

- **`contracts/protocol-*`** (arriba) y **`enforcement/conformance.ts`**
  (`runConformance`, D25) — confirmado sin ningún caller fuera de su
  propio test, no enganchado a `VERIFICATION_MANIFEST` ni a CI. Ambos ya
  tienen la evidencia de no-uso reunida en el registro de auditoría — pero
  eso es la evidencia, no el packet formal. **Requisito para la
  implementación**: se abren como packets de tipo remoción explícitos (no
  como parte de un packet de "construir el backend" donde el borrado
  queda implícito), con el delta de líneas real (medido) como parte del
  receipt de cierre.

## Ortogonal al pivote — sigue como está

- **`check/`+`enforcement/`** salvo `conformance.ts` (arriba) — gates de
  build-time/CI (duplicateStrings, literalComparisons, ormApplicationSql,
  secrets, roles catalog closure). `npm run lint` ya invoca
  `check/source-policy-cli.js` directo, no a través de `cli/commands/check.ts`
  — no forman parte del pipeline runtime de dispatch/task/review, no
  necesitan endpoint REST.
- **`verification/`** — el motor genérico detrás de `npm run verify` (4
  componentes: typecheck/lint/test/`playbook`). Sin cambios.
- **`schema/`** — el DSL de validación interno. Sin cambios.

## Sobrevive, cambia de mecanismo (no de concepto)

- **`ensureSession()`** (identidad de sesión) — el concepto (una task
  activa necesita una identidad durable para atribuir leases/notas)
  sobrevive; el mecanismo (leer un archivo ambient en el cwd) no tiene
  sentido para un cliente HTTP sin cwd. Bajo el backend nuevo, quien crea
  el worktree para un dispatch ya sabe qué sesión pertenece a qué task en
  el momento de crearlo.
- **`adopt/`** (`inventory.ts`, `gap.ts`, `scaffold.ts`, `taste-infer.ts`)
  — lógica real de análisis de repo para onboardear un proyecto existente,
  sobrevive como lógica, sólo cambia de transporte (ruta REST/MCP en vez
  de comando CLI). **Fix pendiente antes de portar** (D56, encontrado
  recorriendo el código con evidencia real, ya sin ambigüedad tras D58):
  `scaffold.ts` crea `docs/packets/` incondicionalmente y `gap.ts` la
  trata como requisito de instalación — contradice la decisión de abajo
  (DB como única fuente) y ahora que D58 retiró la autoría en `.md` del
  todo, el directorio deja de tener cualquier consumidor. Se quita del
  checklist de `analyzeGaps` y `scaffold.ts` deja de crearlo — sin
  condicional, es requisito directo.

## DB como única fuente de verdad para packets (sin espejo `.md`)

El backend nuevo **no** espeja cada packet a un archivo `.md` versionado
en git — es la decisión detrás de la mayoría de lo de arriba (`rebuild.ts`,
el fix de `adopt/`, el retiro completo de `packets/document.ts`).
Consecuencia directa: PRINCIPLE-003 ("nada importante vive sólo en una
herramienta de memoria") necesita un mecanismo de durabilidad distinto
para packets — el sistema de `backup/` que ya existe
(`createStateBackup`) pasa a ser la única red de recuperación real, ver
[operational-decisions.md](operational-decisions.md#backup) para los dos
requisitos nuevos que eso exige (remoto + trigger periódico).

**Cerrado (D58)**: la autoría de packets en `.md` NO sobrevive como
camino secundario — decisión directa del founder. DB/API es la única
forma de crear un packet, sin excepción.
