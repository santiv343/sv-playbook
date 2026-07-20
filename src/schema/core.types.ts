// El truco de tipos detrás de s.object(): ObjectShape separa las keys en
// requeridas vs opcionales (vía el marcador `_optional` que optional()
// agrega en core.ts) y arma un tipo donde las opcionales llevan `?` — así
// TypeScript exige los campos requeridos y permite omitir los opcionales,
// coincidiendo exactamente con lo que parseField() hace en runtime.
export interface Schema<T> {
  parse(value: unknown): T;
}

export type Infer<S> = S extends Schema<infer T> ? T : never;

type IsOptionalSchema<S> = S extends { _optional: true } ? true : false;

type OptionalKeysOf<T extends Record<string, Schema<unknown>>> = {
  [K in keyof T]: IsOptionalSchema<T[K]> extends true ? K : never;
}[keyof T];

type RequiredKeysOf<T extends Record<string, Schema<unknown>>> = {
  [K in keyof T]: IsOptionalSchema<T[K]> extends true ? never : K;
}[keyof T];

export type ObjectShape<T extends Record<string, Schema<unknown>>> =
  { [K in RequiredKeysOf<T>]: Infer<T[K]> } &
  { [K in OptionalKeysOf<T>]?: Exclude<Infer<T[K]>, undefined> };
