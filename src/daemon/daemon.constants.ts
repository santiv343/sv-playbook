// DAEMON_LOCK_FILE es el archivo del compare-and-swap de daemon.lock.ts
// (openSync 'wx'); DAEMON_TOKEN_FILE es el secreto que autentica requests
// al daemon (leído por forwardToDaemonSync en client.ts). Los dos timeouts
// documentados abajo (connect vs full-request) son deliberadamente
// distintos: connect es sólo "¿el daemon está vivo y aceptando?", el
// segundo cubre todo el ciclo hasta recibir la respuesta completa.
export const DAEMON_DEFAULT_PORT = 4141;
export const DAEMON_LOCK_FILE = '.svp-daemon.lock';
export const DAEMON_TOKEN_FILE = '.svp-daemon-token';
export const DAEMON_VERSION = '0.1.0';
/** Name of the git metadata entry (dir or file) that marks a worktree root. */
export const GIT_DIR_NAME = '.git';
export const DAEMON_ROUTE = {
  HEALTH: '/api/v1/health',
  EXECUTE: '/api/v1/exec',
  SHUTDOWN: '/api/v1/shutdown',
} as const;
export const BUILD_DIGEST_HEALTH_FIELD = 'buildDigest';
export const ERR_INVALID_CONTEXT = 'invalid context';

/** TCP connect deadline in ms for the forwarding transport child process.
 *  The child gives up and exits this long after issuing the HTTP POST if the
 *  daemon has not accepted the TCP connection. Once connected, there is no
 *  inactivity timeout — commands set their own deadlines. */
export const DAEMON_CONNECT_TIMEOUT_MS_DEFAULT = 5000;

/** Full-request timeout in ms for the forwarding transport child process.
 *  Covers connect + processing. Cancelled only when the complete HTTP
 *  response body is received or an error/close terminates the request.
 *  Prevents the CLI from hanging indefinitely when the daemon stops
 *  responding after accepting the TCP connection. */
export const DAEMON_REQUEST_TIMEOUT_MS_DEFAULT = 30000;

/** argv prefix (post `sv-playbook`) that identifies the one command known
 *  to legitimately run long for real reasons (`dispatch start`, que espera
 *  a un turno de agente real completo — puede tardar minutos, no segundos.
 *  Encontrado en vivo: el default de 30s mataba `dispatch start` en
 *  silencio a mitad de un dispatch real contra OpenCode, sin ningún
 *  mensaje — root-caused 2026-07-22). Matched positionally by
 *  forwardTimeoutForArgs, same "top-level command name outside
 *  cli/commands/" pattern as STORE_PROCESS_KIND in db/store.constants.ts.
 *  Su piso real es `daemon.dispatchTimeoutMs` en playbook.config.json
 *  (config.constants.ts DAEMON_DEFAULTS), no una constante acá. */
export const DISPATCH_LONG_RUNNING_ARGS = ['dispatch', 'start'] as const;

/** Sentinel de exit code que el script hijo de forwardToDaemonSync usa
 *  específicamente para "el request venció" — distinto del 1 genérico de
 *  cualquier otro fallo de transporte, para que el proceso padre pueda
 *  imprimir un mensaje claro en vez de terminar en silencio. */
export const DAEMON_FORWARD_TIMEOUT_EXIT_CODE = 124;
