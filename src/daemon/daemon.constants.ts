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
 *  inactivity timeout — commands set their own deadlines.
 *  Override via daemon config (not yet implemented). */
export const DAEMON_CONNECT_TIMEOUT_MS_DEFAULT = 5000;
