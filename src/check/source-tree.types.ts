// Shape mínimo compartido por todos los gates de fuente — path normalizado
// (POSIX) + contenido crudo, la entrada común de la que cada gate deriva
// su propio tipo *Source (DuplicateStringSource, etc.).
export interface SourceText {
  readonly path: string;
  readonly source: string;
}
