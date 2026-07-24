# Roles: 4 activos, 5 dormidos

← [índice](README.md) · relacionado: [runtime-engines.md](runtime-engines.md) ·
[backend-api.md](backend-api.md) ·
fuente: `arquitectura-simplificacion.md` D2/D3/D32/D44/E1,
`mapa-flujo-app.md` Tramo 10

## Roles activos

`human-interface`, `delivery-orchestrator`, `implementer`, `reviewer` —
los únicos que se llegaron a dispatchar de verdad, y mapean 1:1 con el
mínimo que recomienda la propuesta externa de kanban agéntico
(orquestador + worker + reviewer + interfaz humana).

## Tabla de absorción (roles dormidos)

| Dormido | Absorbido por |
|---|---|
| `refuter` | `reviewer` |
| `advisor` | `human-interface` |
| `planner` | `delivery-orchestrator` |
| `arbiter` | `human-interface` |
| `investigator` | `implementer` |

No se borra nada — el charter de cada rol dormido sigue existiendo, sólo
no se compila su propio pack; se compila como contenido agregado del rol
que lo absorbe.

**Por qué `arbiter` va a `human-interface` y no a `delivery-orchestrator`**
(la corrección más seria de la auditoría, D32): `arbiter` existe para
resolver desacuerdos entre `planner` (propone) y `refuter` (objeta) — es
el árbitro NEUTRAL entre ambos. Si tanto `planner` como `arbiter` se
absorbieran en `delivery-orchestrator`, ese rol terminaría arbitrando
desacuerdos sobre su propia propuesta absorbida — self-arbitraje, lo que
HJ-010 prohíbe explícitamente y lo que HJ-016 existe para evitar. Encaja
con HJ-018 (regla de decisión humana): un desacuerdo genuino sin árbitro
dedicado escala a `human-interface` (y de ahí al humano si hace falta), no
se resuelve en silencio dentro del mismo rol que propuso lo disputado.

Los otros tres mapeos se verificaron limpios contra las cartas reales
(`content/roles/generated-charters.md`): `advisor`↔`human-interface` ya
son handoffs exclusivos entre sí; `investigator`→`implementer` no genera
loop porque `implementer` ya tiene prohibido `candidate.approve`;
`refuter`→`reviewer` evalúan objetos distintos del ciclo de vida (planes
vs. candidatos), nunca arbitran el output del otro.

## Dónde vive: DB, no config

`role_activation` (role_id, status active/dormant, absorbed_by) vive en la
misma DB que `role_handoffs` — editable desde el frontend, mientras no
exista desde el backend directo. No es `playbook.config.json`.

```sql
CREATE TABLE role_activation (
  role_id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('active', 'dormant')),
  absorbed_by TEXT REFERENCES role_activation(role_id),
  updated_at TEXT NOT NULL
);
-- invariante: absorbed_by IS NOT NULL  <=>  status = 'dormant'
-- invariante: absorbed_by, si está, debe apuntar a una fila status='active'
```

Semilla inicial: los 4 activos con `absorbed_by = NULL`, los 5 dormidos
con `absorbed_by` según la tabla de arriba.

## Mecanismo exacto de plegado de contexto

`requestAttributes()` en `context/compiler.ts:31` arma hoy `role:
[input.role]` (pisa cualquier valor previo). Pasa a: `role: [input.role,
...absorbedRoleIdsOf(input.role)]` — el resto de `compileContext`
(selección por selector) no cambia nada, ya hace intersección contra un
array. Un context item cuyo selector apunta a `refuter` se sigue
seleccionando al compilar el pack de `reviewer`, sin tocar
`selectCandidates`/`resolveSemanticConflicts`.

`absorbedRoleIdsOf(roleId)` es una consulta nueva de una línea (`SELECT
role_id FROM role_activation WHERE absorbed_by = ? AND status =
'dormant'`), resuelta en `run-spec.ts` antes de llamar `compileContext`
(mismo lugar donde hoy se arma `contextAttributes`).

**Nota de tamaño real del trabajo**: hoy la activación es de catálogo
completo, no por rol (`activateRoleCatalog()` activa TODOS los roles a la
vez, `roleSetViolations` rechaza cualquier rol fuera del catálogo
requerido) — no existe el concepto "rol presente pero dormido". Esto no es
extender un mecanismo existente, es mecanismo nuevo en dos subsistemas:
(a) activación individual por rol, (b) lógica nueva en `context/compiler.ts`
para el plegado.

## Dos gates que hay que actualizar juntos, mismo fix de fondo

`checkRoleCatalog`/`roleSetViolations` (`catalog.ts`) y
`checkCatalogClosure`'s `roleProfileViolations` (`check/catalog-closure.ts`)
hoy tratan `requiredRoles` como binario (está o no está en el catálogo),
sin distinguir activo/dormido. Sin actualizarlos, `checkCatalogClosure`
**bloquea mecánicamente** el modelo de 4 activos/5 dormidos — exigiría
perfil de ejecución habilitado para roles que por diseño nunca se
despachan solos. Fix único para ambos: filtrar `requiredRoles` contra
`role_activation.status = 'active'`. Detalle línea a línea del gate en
`mapa-flujo-app.md` § Tramo 12.
