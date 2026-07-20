// Lista fija de dependencias que inventoryRepo busca en package.json de un
// repo AJENO para inferir su stack — deliberadamente chica hoy (sólo
// TS/React), se amplía a medida que adopt.ts necesite reconocer más
// stacks.
export const INVENTORY_DEPENDENCY = {
  TYPESCRIPT: 'typescript',
  REACT: 'react',
  REACT_DOM: 'react-dom',
} as const;

export const INVENTORY_STACK = {
  NODE: 'node',
} as const;
