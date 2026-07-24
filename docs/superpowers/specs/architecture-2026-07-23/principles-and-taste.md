# Qué texto de `content/` hay que reescribir

← [índice](README.md) · fuente: `arquitectura-simplificacion.md`
D4/D28/D30/D46, cruce HJ-001..021

El pivote de arquitectura obliga a reformular dos principios propios del
proyecto — no es un detalle de implementación, es mantener la metodología
consistente con lo que gobierna.

## PRINCIPLE-012 — de "la CLI" a "la API del backend"

Texto viejo: *"la CLI es la única interfaz — todo create/edit/query/
recovery pasa por la CLI... si la CLI no puede hacer algo, es un gap de la
CLI, nunca una excepción."* El pivote mata la CLI como interfaz por
completo — sin reformular, la arquitectura nueva entera queda en violación
de la metodología que la gobierna.

**Texto nuevo propuesto:**

> PRINCIPLE-012 — **La API del backend es la única interfaz.** Operational
> state (la DB, definiciones de tasks, el board) nunca se lee ni se
> escribe directo — todo create/edit/query/recovery pasa por las rutas del
> backend, consumidas igual por el frontend y por el MCP — ningún camino
> paralelo. Acceso directo a la DB o edición a mano de un archivo de
> estado es una violación instantánea, igual para agentes que para el
> orquestador. Si el backend no puede hacer algo, eso es un gap del
> backend (un packet), nunca una excepción.

Coherencia: esto es literalmente lo que ya hacen [removed.md](removed.md)
(tirar el passthrough genérico) y [backend-api.md](backend-api.md) (cada
ruta llama directo a una función de servicio) — la práctica ya estaba
alineada, sólo faltaba el texto.

**Dónde propagar** (el texto viejo aparece repetido casi palabra por
palabra en 4 lugares — actualizar sólo `principles.md` deja 3 documentos
fundacionales contradiciendo al principio que citan como canónico,
exactamente el drift que PRINCIPLE-004 existe para prevenir):

1. `content/principles.md` (PRINCIPLE-012 mismo).
2. `content/review.md` — hard rule del reviewer checklist: *"Direct DB
   access outside src/db or hand-edited packet files (PRINCIPLE-012)"*.
3. `docs/VISION.md` — una de exactamente 5 invariantes del motor, "never
   configurable": *"The CLI is the sole interface..."*.
4. `docs/anatomy.md` — la primera de "las tres reglas que explican todas
   las demás": *"El CLI es el único escritor de estado..."*.

Mismo packet cuando se implemente, no una decisión nueva.

## PRINCIPLE-013 — opiniones en estado persistido y versionado, no sólo config

Texto viejo: "las opiniones viven en configuración, nunca hardcodeadas".

**Texto nuevo**: "las opiniones viven en estado persistido y
versionado — archivo de config para lo portable entre repos (tier,
autonomy, gates, verifyCommand), DB para lo que una UI en vivo necesita
mutar (activación de roles — ver [roles-and-context.md](roles-and-context.md)
— y cualquier otra cosa que el frontend vaya a editar)".

## `instructions --write` no muere con el resto de la ayuda de CLI

No es un generador de docs cualquiera (a diferencia de `describe`/`docs`/
`generate-index`, que sí mueren sin reemplazo) — es el mecanismo que
mantiene vivo PRINCIPLE-004 mismo: compila `content/principles.md` +
`content/roles/generated-charters.md` + demás fuentes canónicas hacia
`CLAUDE.md`/`AGENTS.md`/mirrors de harness. Si muere sin reemplazo,
PRINCIPLE-004 dejaría de tener mecanismo. Se agrega a
[backend-api.md](backend-api.md) con ruta propia (`POST
/instructions/write`) o se deja como script post-build — cualquiera de
las dos formas mantiene el mecanismo vivo; la que NO es aceptable es
dejarlo sin ningún camino.

## Correcciones de proceso pendientes (no de diseño)

- **PR #207 (HJ-022) sigue sin mergear** — está citado como taste
  aplicable (justifica React+Vite en
  [operational-decisions.md](operational-decisions.md#stack-de-frontend))
  pero formalmente sigue en estado "propuesto", no vinculante — el estado
  que HJ-021 prescribe para taste nueva sin confirmar. La decisión de
  stack se sostiene igual por su propio razonamiento, pero conviene
  mergear el PR (es un doc chico, listo) para que deje de estar en ese
  limbo.
