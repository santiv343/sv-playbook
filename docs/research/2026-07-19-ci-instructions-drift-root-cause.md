# Causa raíz: drift de `check instructions` entre CI y local

## Conclusión

El fallo no fue no determinismo de Node, locale, `Map`/`Set` ni orden del
filesystem. Fue una comparación contra estados distintos del catálogo
persistido: CI crea un store vacío y ejecuta el bootstrap actual; los
entornos locales que dieron verde conservaban el store fuera del repo, por lo
que el bootstrap idempotente podía reutilizar el contenido anterior que ya
coincidía con los mirrors viejos.

El caso está probado por el run fallido de PR #183, que ejecutó el árbol limpio
de la integración temporal `df4414b3959e44415a34068357b90164d3eb2460` y,
después del bootstrap, informó exactamente:

```
instructions: AGENTS.md diverges from source
instructions: CLAUDE.md diverges from source
```

El mismo log muestra que no se trató del SHA de la rama: Actions hizo
`fetch ... refs/remotes/pull/183/merge` y dejó `HEAD` en
`df4414...`, cuyo padre de PR era `931eb3...` y cuya base era
`154490...`. Por tanto CI sí valida el merge commit temporal. En este caso,
sin embargo, el `git diff` entre `931eb3...` y `df4414...` para
`AGENTS.md`, `CLAUDE.md`, `content/instructions/cold-start.md`,
`instructions.ts` y los scripts de bootstrap no contiene cambios: la topología
de merge explica qué SHA se debe reproducir, pero no fue el origen material
del texto divergente.

## Evidencia del estado persistido

- `renderInstructionsContent()` abre el store y construye el texto desde
  `loadContextCatalog()` + `compileContext(... human-interface, intake)`
  (`src/cli/commands/instructions.ts:34-47`). No genera solamente desde los
  archivos versionados.
- `npm run verify` ejecuta `bootstrap-context.mjs` antes de la verificación
  (`package.json`, script `verify`).
- `resolveStoreRoot()` ubica el store en
  `%LOCALAPPDATA%/sv-playbook/<hash-del-common-root>` en Windows y fuera del
  checkout (`src/db/store-location.ts:20-27`); `.svp/` está ignorado. El
  catálogo que participa en la generación no viaja con Git.
- Los bootstrap de principios y perfil humano leen el catálogo existente y
  omiten cada identidad activa (`scripts/bootstrap-principles.mjs:41-51`; el
  mismo patrón está en `scripts/bootstrap-taste-human.mjs`). No reemplazan el
  `body` existente.

Por eso una verificación local sobre una raíz que ya tenía el catálogo previo
puede calcular los mirrors previos, mientras que el runner efímero calcula los
mirrors desde las fuentes actuales. La diferencia observada como un viejo
trailer de misión es un artefacto generado stale, no una diferencia de
plataforma.

## Hipótesis descartadas

- El bootstrap no enumera archivos para decidir el orden: `bootstrap-context`
  invoca una secuencia literal y los principios/entradas están en arrays
  literales.
- Las cargas relevantes aplican orden explícito: `loadContextCatalog()` usa
  `ORDER BY` en `context_items`, precedencia, tags, selectores, referencias y
  capabilities (`src/context/repository.ts:159-235`); `compileContext()`
  ordena tags, referencias, capacidades e ítems (`src/context/compiler.ts`).
- El workflow fija Node `22.13` en ambos runners y el fallo ocurrió tanto en
  Ubuntu como Windows; no hay lectura de locale, timestamp o entorno en la
  ruta de renderizado.

## Acción recomendada

El arreglo pequeño y de bajo riesgo es volver determinista el bootstrap frente
a contenido versionado que cambie: guardar y comparar un digest de la fuente
de cada ítem bootstrapado y reemplazar/versionar la fila cuando difiera, con
una prueba que ejecute dos bootstrap consecutivos cambiando la fuente y luego
compruebe que `check instructions` detecta el resultado nuevo en un store ya
existente. Debe decidirse antes la semántica de historial (nueva versión con
`supersedes` frente a actualizar una proyección administrada); no se aplica
automáticamente aquí.

Como rail inmediato de diagnóstico, CI debería imprimir `git rev-parse HEAD`,
los SHA head/base del PR y el digest de `renderInstructionsContent()`. Eso hace
visible la comparación de merge-commit y evita volver a atribuir un drift de
estado a los runners.
