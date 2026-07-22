// El único matcher de globs de todo el sistema — write_set conflict entre
// packets, gateReview contra git diff, workspace classification (flujo
// 3, 4, y src/workspace/), todos llaman a esta misma función. Dos casos:
// (1) ambos son globs de directorio (`a/**`, `b/*`) — se comparan como
// prefijos de path, cubriendo el caso "uno es subcarpeta del otro" en
// cualquier dirección; (2) si no, `right` se trata como un path literal y
// `left` como el patrón — se compila a una regex simple donde `*` matchea
// cualquier cosa menos `/`.
export function overlaps(left: string, right: string): boolean {
  const leftPrefix = left.replace(/\/\*\*$|\/\*$/, '');
  const rightPrefix = right.replace(/\/\*\*$|\/\*$/, '');
  if (leftPrefix === rightPrefix
    || leftPrefix.startsWith(`${rightPrefix}/`)
    || rightPrefix.startsWith(`${leftPrefix}/`)) return true;
  return new RegExp(`^${left.replace(/\./g, '\\.').replace(/\*/g, '[^/]*')}$`).test(right);
}
