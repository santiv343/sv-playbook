export const SECRET_PATTERNS: readonly { kind: string; pattern: RegExp }[] = [
  { kind: 'aws-access-key', pattern: /AKIA[0-9A-Z]{16}/ },
  { kind: 'private-key-header', pattern: /-----BEGIN[ A-Z]*PRIVATE KEY-----/ },
  { kind: 'jwt', pattern: /\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/ },
];
