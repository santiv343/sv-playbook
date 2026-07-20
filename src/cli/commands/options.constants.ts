// Objetos compartidos para parseArgs({ options: { flag: STRING_OPTION } })
// — evita repetir `{ type: 'string' }` como literal suelto en cada comando.
export const STRING_OPTION = { type: 'string' } as const;
export const BOOLEAN_OPTION = { type: 'boolean' } as const;
