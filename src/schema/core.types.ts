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
