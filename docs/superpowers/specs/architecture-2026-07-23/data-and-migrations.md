# Datos: motor, migraciones, contratos, evidencia

← [índice](README.md) · relacionado: [runtime-engines.md](runtime-engines.md) ·
fuente: `arquitectura-simplificacion.md` D19/D26,
`mapa-flujo-app.md` Tramos 11/13

## Motor

SQLite + Drizzle ORM. Sin cambios de fondo — el pivote fue sobre
arquitectura de proceso/interfaz, no sobre almacenamiento.

## Migraciones — mecanismo normal, un gap conocido con ubicación exacta

`checkVersionAndMigrate`/`migrateStore` (`db/store.migrations.ts:326,356`)
son migración aditiva idempotente estándar: `CREATE TABLE IF NOT EXISTS`
por feature, backup verificado antes de migrar, rechazo si hay leases
foráneas frescas en el store compartido. Sin cambios necesarios.

**El gap real**: `assertMigrationBranch(repoRoot, migrateLive)`
(`db/store.migration-branch.ts:29`) respeta perfectamente el flag
`migrateLive` — si no se está en la rama default y `migrateLive` no es
`true`, rechaza con instrucciones claras. El flag existe en el tipo
(`MigrateStoreOptions.migrateLive`) y la lógica ya lo maneja bien. **El gap
no es la lógica, es que ningún comando CLI llega a parsear
`--migrate-live` y pasarlo hasta acá** — el guard sugiere la flag pero
nada la expone. Se cierra sólo con la ruta `POST /migrate {migrateLive?}`
de [backend-api.md](backend-api.md); si el port no incluye esa ruta, la
CAPACIDAD (no sólo el bug puntual) se pierde, no se arregla sola.

## Sistema de contratos de artifacts (`contracts/artifacts.ts`)

El 20% de `contracts/` (289L) que sí sobrevive — ver
[removed.md](removed.md) para el 80% que no. Registro de JSON Schemas
versionados en DB:

- `addArtifactContract(store, contract)` — valida que el schema compile
  (Ajv2020 `strict: true`) antes de insertar, guarda `schema_digest`.
- `checkArtifactContracts(store)` — chequeo PROACTIVO: todo contrato que
  un `role_contract`/`role_handoff` referencia tiene que existir y
  compilar, antes de que algo intente usarlo en runtime.
- `validateArtifact(store, ref, artifact)` — el punto que SÍ se llama en
  caliente, desde `review/` (candidatos) y `orchestration/` (output de
  steps humanos).

Simplificación pendiente (no bloqueante, anotada para cuando se
implemente): el resolver de dependencias entre contratos
(`contractDependencies`/`mergedDefinitions`) camina un grafo de
profundidad arbitraria, pero en la práctica `SHARED_PROTOCOL_DEFINITION`
tiene sólo 3 valores fijos y ningún contrato referencia a otro contrato —
jerarquía de un solo nivel, siempre igual. Reemplazar el graph-walk por
"cada contrato = sus propiedades + los 3 bloques compartidos fijos que
use" cubre el 100% de los casos reales con menos código.

## Formato de evidencia etiquetada (diseño exacto)

Hoy `gateEvidence` sólo chequea "¿existe algún evento de evidencia?",
nunca cuál — un packet que declara `evidenceRequired: ['final-sha',
'security-signoff', 'load-test-passed']` se satisface con cualquier evento
sin importar cuál. Diseño para el port:

- Los eventos de evidencia ganan un campo `evidence_label TEXT NULL`.
- `recordEvidence(store, packetId, label, detail)` exige que `label` sea
  uno de los valores declarados en `evidenceRequired` del work definition,
  o rechaza (`unknown evidence label: X, expected one of [...]`).
- El gate cambia de "¿existe al menos un evento?" a "¿existe al menos un
  evento por CADA label en `evidenceRequired`?" — mismo patrón de
  acumular violaciones que `assertPreflight`/`checkArtifactContracts`,
  nunca aprobar con hallazgos parciales sin resolver.
- Ruta: `POST /packets/:id/evidence {label, detail}` — ver
  [backend-api.md](backend-api.md), y el requisito de `actorKind:'human'`
  para labels de juicio humano en [mcp-and-identity.md](mcp-and-identity.md).

## `schema/core.ts` — no confundir con `contracts/`

Mini-librería de validación interna tipo-Zod (`s.object`,
`s.nonEmptyString`, sin dependencia externa), usada por
`promotion-operation.ts` y similares para validar estructuras internas del
propio código. `contracts/artifacts.ts` es JSON Schema para artifacts
EXTERNOS/agénticos versionados en DB — dominios distintos que sólo
comparten la palabra "schema" en la superficie. Detalle línea a línea en
`mapa-flujo-app.md` § Tramo 13.
