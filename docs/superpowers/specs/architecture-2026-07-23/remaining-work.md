# Lo que no se resuelve leyendo más código

← [índice](README.md) · fuente: `arquitectura-simplificacion.md` D6/D31/D36/
D37/D49, barrido de backlog D50-D54/D57/D58

Esto no son huecos en la investigación — son preguntas de producto/proceso
que el propio registro de auditoría identificó como genuinamente abiertas,
o deuda que sobrevive al port sin agravarse ni resolverse por el pivote.
Ninguna bloquea empezar a escribir el spec de implementación.

## Preguntas de producto sin cerrar del todo

- **UI: distinguir verdad mecánica de resumen de agente.** HJ-015 exige
  que el frontend nunca presente un resumen de LLM como si fuera hecho
  verificado — señalado como necesidad real durante el cruce contra
  HJ-019, pero es trabajo de diseño de frontend, no de esta capa de
  arquitectura. Queda para cuando se diseñe el frontend en concreto. Es
  la única pregunta de esta categoría que sigue abierta — la otra (¿la
  autoría de packets en `.md` sobrevive?) ya se cerró: no, se retira
  (D58, decisión del founder) — ver [removed.md](removed.md).

## Trabajo de implementación con alcance propio (no implícito en otra pieza)

- **Reescritura de `content/dispatch/worker.md`** para MCP — ver
  [mcp-and-identity.md](mcp-and-identity.md). Es la plantilla real que
  recibe cada agente despachado; "existe un mapeo 1:1" no alcanza, hay que
  reescribir el prompt paso a paso.
- **Packets de remoción formales** para `contracts/protocol-*` y
  `enforcement/conformance.ts` (PRINCIPLE-015) — ver [removed.md](removed.md).
  La evidencia de no-uso ya está reunida; falta el packet mismo, con el
  delta de líneas medido (no estimado) en el receipt de cierre.
- **Fix de `adopt/gap.ts`/`scaffold.ts`** (D56) — ver [removed.md](removed.md).

## Deuda que sobrevive al port sin agravarse

- **Patrón sistémico de "detección de divergencia por digest"** — aparece
  en 6 lugares del sistema (3 ya resueltos: activación de catálogo de
  roles, versión de schema, identidad de promoción; 3 sin resolver: dos
  bugs de integridad referencial en `context/repository.ts`/
  `tasks/service.ts` que validan contra listas estáticas en vez de la
  tabla real, y el bootstrap de contexto que hace skip-if-exists en vez
  de digest-compare). Recomendación del registro de auditoría: extraer
  una utilidad única de detección de drift en vez de 3 arreglos
  separados, cuando se llegue a implementar.
- **Huérfanas de seguridad, ortogonales al pivote, siguen relevantes**:
  secretos en config persistido, output crudo de agente capturado sin
  filtrar, salida de agente persistida verbatim (IDEA-083/084/085) —
  ninguna depende de CLI vs. backend, ninguna se resuelve ni se agrava con
  el port.
- **~60 entradas del backlog** ortogonales a la arquitectura (mejoras de
  producto/proceso: configurabilidad real de columnas/tiers/tipos de
  packet, agnosticismo de dominio, fallback de modelos, búsqueda
  semántica, etc.) — siguen `unvalidated` por buena razón: seguir siendo
  válidas no es lo mismo que estar resueltas, y no las decide el pivote de
  arquitectura.

## Clasificación build/adopt/adapt (HJ-005)

Confirmado: **build** es correcto para lo que se está construyendo acá —
no hay un producto adoptable/adaptable que cubra "backend+frontend+MCP
específico para este dominio de kanban agéntico con este modelo de roles".
`adopt/` (herramienta de onboarding, [removed.md](removed.md)) es de uso
único por proyecto externo adoptado, no repetido — su cero-uso actual pesa
distinto que el de `contracts/protocol-*`, se anota "a vigilar", no se
recomienda subtracción todavía.
