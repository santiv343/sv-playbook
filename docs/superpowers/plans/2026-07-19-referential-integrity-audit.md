# Plan de implementación: auditoría de integridad referencial (IDEA-119)

**Objetivo:** rechazar antes de persistir toda referencia a una identidad cerrada
que no exista, sin cerrar vocabularios intencionalmente libres.

## Hallazgos verificados

1. `src/context/repository.ts:47-55` valida selectores `role` contra el set
   estático `BUNDLED_ROLE_ID`, no contra `role_contracts`; además
   `addContextItem()` construye e inserta `dependencies` sin comprobar que el
   par `context_items(id, version)` exista.
2. `src/tasks/service.ts:92-97`, `upsertDeps`, filtra dependencias de packet
   inexistentes. Por tanto create/import/update/amend aceptan un `depends_on`
   que luego desaparece silenciosamente.
3. Las demás relaciones persistidas del inventario están protegidas por claves
   foráneas declaradas en los esquemas `store`, `context`, `role-catalog`,
   `orchestration` y `review-candidate`. No se detectó otro bypass de inserción.

## Fuera de alcance deliberado

No validar `phase`, `tags` ni los textos de capability: son dimensiones de
vocabulario abierto. IDEA-119 exige sólo identidades cerradas/enumerables.

## Tarea 1: validar referencias de contexto contra el store

**Archivos:** `src/context/repository.ts`, `src/context/repository.test.ts`.

- [ ] Escribir primero pruebas que intenten crear un contexto con una
  dependencia `id@version` inexistente y con selector `role` inexistente; ambas
  deben rechazar con `ContextError` y no dejar filas parciales.
- [ ] Añadir `validateContextReferences(store, item, dependencies)` antes del
  `INSERT`: comprobar cada dependencia contra `context_items(id, version)` y
  cada selector de dimensión `role` contra `role_contracts(role_id)`.
- [ ] Mantener aceptación explícita de un role existente sólo en el catálogo DB
  y de `phase`/tags libres; no volver a introducir el set bundled como fuente
  paralela de verdad.
- [ ] Ejecutar las pruebas focalizadas y confirmar RED antes de la
  implementación, luego verde.

## Tarea 2: validar `depends_on` de packets sin filtrarlo

**Archivos:** `src/tasks/service.ts`, sus pruebas de servicio/comando de tasks.

- [ ] Escribir pruebas RED para create, import y update/amend con un packet id
  inexistente en `depends_on`; cada operación debe fallar y conservar el estado
  previo intacto. Añadir un control con dependencia existente.
- [ ] Reemplazar el filtro silencioso de `upsertDeps` (líneas 92-97) por
  `validatePacketReferences` fail-closed contra `packets(id)`, antes de mutar
  la relación.
- [ ] Asegurar que el mensaje identifica el id inválido y que la transacción no
  deja un packet ni relaciones a medio escribir.
- [ ] Ejecutar la prueba focalizada RED/verde y `npm run verify`.

## Criterios de aceptación

- Ninguna de las dos rutas persiste o descarta en silencio una identidad
  inexistente.
- Las dimensiones de texto libre continúan aceptándose.
- `npm run verify` queda verde tras la implementación.
