# MCP y el modelo de identidad humano/agente

← [índice](README.md) · relacionado: [backend-api.md](backend-api.md) ·
fuente: `arquitectura-simplificacion.md` D24/D35/D45/E6

## MCP: mapeo 1:1 con las rutas REST

Cada tool MCP es un wrapper delgado de una llamada HTTP a la ruta
equivalente de [backend-api.md](backend-api.md) — mismo nombre semántico,
mismo payload. **No hay lógica propia del lado MCP** — si la hubiera,
sería un segundo camino paralelo a la app, exactamente lo que el pivote
descarta. El MCP server es un cliente HTTP más, al mismo nivel que el
frontend.

**Quién lo usa**: el agente YA dispatchado, trabajando dentro de su
worktree (ver [operational-decisions.md](operational-decisions.md)),
cuando necesita llamar de vuelta a sv-playbook — equivalente a lo que hoy
hace un agente corriendo `task note`/`decision answer` desde su sesión
CLI. No confundir con el dispatch en sí (backend → OpenCode vía
`gateway/`, [runtime-engines.md](runtime-engines.md)) — es la dirección
inversa. Corre como proceso propio, transporte stdio (estándar MCP para
harnesses locales), cada tool call se traduce a un `fetch` HTTP contra
`localhost:<puerto backend>`. Se configura en el execution profile del rol
como una tool source más.

**Trabajo de implementación con alcance propio** (no un detalle implícito
de "hay mapeo 1:1"): la plantilla real de dispatch
(`content/dispatch/worker.md`) hoy tiene al agente corriendo la CLI
directo en cada paso (`task brief`, `task start`, `git worktree add` como
Step 1) — necesita reescritura completa para MCP, paso a paso, no sólo el
mapeo abstracto. Mismo destino para `content/skills/repo-state.md` (llama
`status`/`doctor` vía CLI). Ver [remaining-work.md](remaining-work.md).

## Cómo el sistema sabe si quien pide algo es humano o agente

El bug viejo (F-006: `destructive-gate.ts`/`decision.ts` interpretando mal
la presencia/ausencia de `.svp-session-role`, un marcador local en el cwd)
no sobrevive tal cual — ya no hay CLI. Pero la pregunta de fondo sigue
siendo real, y la arquitectura nueva la resuelve mejor: **hay dos clientes
distintos, separados por transporte** — frontend = humano, MCP = agente.
La identidad ya no se infiere de un archivo ambiguo, la determina el canal
por el que llegó el request.

**Mecanismo**: cada request que el MCP proxea lleva `actorKind: 'agent'`
explícito; el frontend siempre manda `actorKind: 'human'` (mismo patrón
que `HUMAN_INTAKE_VALUE.LOCAL_ACTOR` ya usa hoy para `requestedBy`).

**Dónde se exige `actorKind === 'human'`**:
- `POST /packets/:id/evidence` — sólo para labels que el work definition
  marque `attestedBy: 'human'`. Evidencia mecánica (`preflight`,
  `clean-verification`) sigue viniendo del camino automático existente,
  nunca de este endpoint; evidencia de juicio humano (`security-signoff`)
  sólo la registra un caller humano — nunca un agente auto-certificándose
  (HJ-019, "an agent checking its own permissions or claiming its own
  evidence").
- `POST /decisions/:id/answer` — el caso original de F-006.
- `POST /human-effects/:id/resolution` — no estaba en el hallazgo
  original, pero es el mismo problema de fondo: hoy no verifica que quien
  resuelve un step `executor: human` sea realmente un humano.

**Riesgo aceptado, explícito**: bajo el modelo de sólo-localhost-sin-auth
([operational-decisions.md](operational-decisions.md)), `actorKind` es un
campo que el propio caller declara — un MCP mal configurado o un script
arbitrario en la misma máquina podría mentir. No es una regresión: es el
mismo límite de confianza que ya se aceptó para todo lo que llega a
`localhost:puerto`.
