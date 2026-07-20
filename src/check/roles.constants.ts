// ROLE_TABLE_STATE es la máquina de estados que findTables (roles.ts) usa
// para parsear tablas markdown de format.md — OUT/HEAD/BODY, ver el
// comentario en roles.ts.
export const ROLE_TABLE_DELIMITER = '|';

export const ROLE_TABLE_STATE = {
  OUT: 'out',
  HEAD: 'head',
  BODY: 'body',
} as const;
