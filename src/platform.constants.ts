export const OS_PLATFORM = { WINDOWS: 'win32' } as const;

export const NODE_ERROR_CODE = {
  ADDRESS_IN_USE: 'EADDRINUSE',
  ALREADY_EXISTS: 'EEXIST',
  BUFFER_EXCEEDED: 'ENOBUFS',
  FILE_NOT_FOUND: 'ENOENT',
} as const;

export const NODE_ERROR_PROPERTY = {
  CODE: 'code',
} as const;

export const PROCESS_EVENT = {
  CLOSE: 'close',
  DATA: 'data',
  ERROR: 'error',
  EXIT: 'exit',
} as const;

export const HTTP_METHOD = {
  GET: 'GET',
  POST: 'POST',
} as const;

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  NOT_FOUND: 404,
  CONFLICT: 409,
} as const;

export const FILE_EXTENSION = {
  MARKDOWN: '.md',
  SQLITE: '.sqlite',
  YAML: '.yml',
  YAML_LONG: '.yaml',
} as const;

export const PATH_TOKEN = {
  CURRENT: '.',
  PARENT: '..',
  POSIX_SEPARATOR: '/',
  WINDOWS_SEPARATOR: '\\',
  DRIVE_SEPARATOR: ':',
} as const;

export const REFERENCE_VERSION_SEPARATOR = '@';
export const REFERENCE_MIN_VERSION = 1;
export const REFERENCE_MIN_ID_LENGTH = 1;
export const REFERENCE_SEPARATOR_WIDTH = 1;
export const EMPTY_SIZE = 0;
export const SINGLE_SIZE = 1;
export const MILLISECONDS_PER_DAY = 86_400_000;

export const HASH_ALGORITHM = {
  SHA256: 'sha256',
} as const;

export const HASH_ENCODING = {
  HEX: 'hex',
} as const;

export const TEXT_ENCODING = {
  UTF8: 'utf8',
} as const;

export const CONTENT_DIRECTORY_NAME = 'content';

export const REFERENCE_KIND = {
  WORK_DEFINITION: 'work-definition',
  WORKFLOW_EFFECT: 'workflow-effect',
  CONTEXT_ITEM: 'context-item',
} as const;
