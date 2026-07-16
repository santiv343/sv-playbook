export function overlaps(left: string, right: string): boolean {
  const leftPrefix = left.replace(/\/\*\*$|\/\*$/, '');
  const rightPrefix = right.replace(/\/\*\*$|\/\*$/, '');
  if (leftPrefix === rightPrefix
    || leftPrefix.startsWith(`${rightPrefix}/`)
    || rightPrefix.startsWith(`${leftPrefix}/`)) return true;
  return new RegExp(`^${left.replace(/\./g, '\\.').replace(/\*/g, '[^/]*')}$`).test(right);
}
