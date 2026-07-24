# Estado del proyecto — foto asentada 2026-07-19

> Reemplaza la versión anterior de este documento, que quedó desactualizada
> tras el trabajo de la semana del 2026-07-13 al 2026-07-19. Si volvés
> después de perderte, empezá acá.

> **Actualización 2026-07-23 — pivote de arquitectura en curso.** Todo lo
> de abajo describe con precisión lo que corre HOY en `main` (CLI +
> daemon, nada de esto se implementó todavía distinto). Pero está en
> discusión/decidido (no implementado) un cambio de arquitectura de
> fondo: la CLI deja de ser la interfaz, pasa a ser backend + frontend +
> MCP. Ver `docs/superpowers/specs/2026-07-23-arquitectura-simplificacion.md`
> (registro de decisiones, D1-D38) y
> `docs/superpowers/specs/2026-07-23-mapa-flujo-app.md` (cómo funciona el
> sistema actual, con cita `archivo:línea`) antes de asumir que el
> catálogo de 9 roles o el daemon de escritor único de abajo van a seguir
> existiendo tal cual.

## Qué hay hoy, en `main`, funcionando

- **Packets 100% en la DB SQLite** (decisión D4). Ya no existen archivos
  `.md` de packets en git — se eliminaron 188 archivos. Historial y diffs
  vía `packet history`/`packet diff`.
- **Checkpoint de complejidad**: gate de aprobación humana antes de que un
  packet toque territorio arquitectónicamente nuevo, con detección
  automática de novedad (no rutas pre-declaradas). Diseño en
  `docs/superpowers/specs/2026-07-16-complexity-checkpoint-design.md`.
- **`.svp/` vive fuera del repo** (relocalizado, ya no en el árbol git),
  con path canonicalizado (Windows short/long paths resuelven al mismo
  store).
- **Daemon de escritor único (STORE-003)**: ownership por PID+nonce
  (resistente a reuso de PID tras un crash), timeout completo en el
  forwarding (no sólo de conexión), recuperación verificada ante
  `SIGKILL`.
- **Detección de daemon con build desactualizado**: si el daemon corre
  código viejo, se niega a reenviar comandos nuevos en vez de fallar en
  silencio.
- **Migración de stores viejos (pre-GATE-012)** corregida: preserva
  constraints reales (UNIQUE/FK) o falla con error explícito — nunca
  fabrica datos ni deja el schema roto en silencio.
- **`write_set` de un packet activo** se puede extender (nunca reducir),
  con evento de auditoría real (quién, cuándo) y sin condición de carrera.
- **Contexto y cold-start**: los 15 principios + HJ-001..021 (taste
  humano) están cargados en `context_items` (DB), no sólo en `.md`.
  `AGENTS.md`/`CLAUDE.md` se generan combinando eso con el catálogo de
  roles vía `compileContext` — un agente que abre sesión ya sabe su rol,
  misión y límites, generado, no prosa genérica.
- **Catálogo de 9 roles** (`human-interface`, `planner`, `refuter`,
  `delivery-orchestrator`, `implementer`, `reviewer`, `advisor`,
  `arbiter`, `investigator`) totalmente definido en DB, con auto-reparación
  si el catálogo falta.
- **CLI autodescubrible**: `Command.usage` obligatorio (gate mecanizado),
  `describe --json` lo expone completo, `content/cli.md` dejó de duplicar
  a mano lo que ahora es generado.
- **Scanner de secretos** (`check secrets`) integrado al pipeline.
- **Gates de deuda técnica monótonamente decrecientes** (duplicate-strings,
  literal-comparisons, ORM-boundary, max-lines) — no pueden empeorar sin
  que el gate lo note.

## Qué está diseñado pero no construido

- Nada en esta categoría al día de hoy — lo único que quedaba
  (`serve-shutdown-lifecycle`) se re-scopeó y quedó como investigación en
  curso (ver abajo, paquete 3).

## Investigaciones en curso (dispatchadas 2026-07-19)

Ver `docs/backlog.md` IDEA-110, IDEA-119, IDEA-065, IDEA-123, y el handoff
`%TEMP%\opencode\handoff-indispensable-ahora.md` para el detalle completo
de cada paquete. Resumen:

1. **Auditoría de integridad referencial** (IDEA-119) — mismo patrón de
   bug visto dos veces esta sesión (referencia a otra entidad sin validar,
   falla en silencio más adelante). Entregable: plan RED-first.
2. **Auditoría de boundary de errores** (IDEA-110) — 24 `catch` genéricos
   sin verificar si mapean bien a exit codes tipados. Entregable: plan
   RED-first.
3. **Re-investigación de `serve-shutdown-lifecycle`** (IDEA-065) — el plan
   viejo asumía una topología de dos procesos que no existe en el código
   actual (verificado 2026-07-19). Hay que confirmar si el bug del
   servidor huérfano puede pasar por otra vía, o cerrar la idea como
   resuelta-no-aplica.
4. **Causa raíz del drift CI-vs-local** (IDEA-123) — el mismo commit
   pasaba limpio en cualquier configuración local pero fallaba
   consistentemente en GitHub Actions. Se parchó el síntoma, no se
   encontró la causa. Diagnóstico puro, sin fix garantizado al final.

## Triage del resto del backlog (119 ideas registradas, ver `docs/backlog.md`)

De 119 entradas, 83 siguen sin tocar (`unvalidated`), 7 pateadas
explícitamente a una v2 futura, y un puñado resueltas/obsoletas. La
enorme mayoría de lo discutido esta semana **todavía no es código**.
Clasificación acordada 2026-07-19:

**Puede esperar** (real, pero sin dolor activo con un solo proyecto usando
playbook):
- Configurabilidad real (columnas de kanban, tiers, tipos de packet,
  checklist de review) — IDEA-053/054/055/056/057.
- Auditoría de las 73 tablas de la DB (IDEA-092).
- Agnosticismo de dominio — sacar del núcleo lo que asume "el trabajo es
  código" (IDEA-100).
- Fallback de modelos por agente (IDEA-122).

**Nice to have / largo plazo** (explícitamente pateado por el founder, o
sin urgencia):
- Búsqueda semántica sobre packets (IDEA-116).
- Wrapper MCP del CLI (IDEA-093).
- Ruteo/dispatch de agentes (IDEA-106) — el founder pidió análisis
  profundo dedicado, no apurarlo.
- Onboarding (`init`)/adopción (`adopt`) desde cero — IDEA-107/108/115,
  el founder fue explícito: pensarlo bien, sin apuro de timing.
- Renombrar `task`→`packet` en todo el CLI (IDEA-096) — cosmético,
  scopeado pero no ejecutado.

## Disciplina que se reafirmó esta semana (no repetir los mismos errores)

- **Nunca fabricar datos ni desactivar una validación para pasar un test
  en verde** — pasó una vez (un fix de migración usaba un UUID inventado
  y apagaba `PRAGMA foreign_keys` para esconderlo), se rechazó y se
  rehizo bien.
- **CI en verde no es evidencia suficiente** — hay que leer el código real
  de cada PR antes de mergear, no sólo el estado de los checks.
- **`git checkout`/`update-branch` de GitHub NO actualiza solo una rama
  "behind" cuando el required-check es `strict`** — hay que forzarlo a
  mano (`gh api -X PUT .../update-branch`) o el auto-merge queda en loop
  infinito.
- Cuando un merge combina dos features que tocan el mismo archivo, revisar
  a mano que no queden bloques de código duplicados/muertos — el
  auto-merge de git no garantiza que el resultado tenga sentido semántico.

## Cómo seguir si te perdiste

1. Este documento es la foto de hoy.
2. Para detalle técnico del checkpoint de complejidad:
   `docs/superpowers/specs/2026-07-16-complexity-checkpoint-design.md`.
3. Para el registro completo de ideas/incidentes: `docs/backlog.md`.
4. Para por qué se borró/consolidó algo viejo: `docs/ARCHIVE.md`.
