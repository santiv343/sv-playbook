import { parseArgs } from 'node:util';
import { EXIT } from '../command.constants.js';
import type { Command, Io } from '../command.types.js';
import { commonRoot, openStore } from '../../db/store.js';
import { stringColumn } from '../../db/rows.js';

function nullableStringColumn(row: unknown, key: string): string | null {
  if (typeof row !== 'object' || row === null) throw new TypeError(`invalid row: expected object for ${key}`);
  for (const [candidate, value] of Object.entries(row)) {
    if (candidate === key) {
      if (value === null) return null;
      if (typeof value === 'string') return value;
      throw new TypeError(`invalid row: column ${key} must be a string or null`);
    }
  }
  throw new TypeError(`invalid row: missing column ${key}`);
}

interface DecisionRow {
  id: string;
  question: string;
  answer: string | null;
  created_at: string;
  updated_at: string;
}

interface Subcommand {
  usage: string;
  run(rest: string[], io: Io): number;
}

class UsageError extends Error {}

function withStore<T>(fn: (store: { db: { prepare(sql: string): { run(...params: unknown[]): unknown; get(...params: unknown[]): unknown; all(...params: unknown[]): unknown[] }; exec(sql: string): void }; close(): void }, repoRoot: string) => T): T {
  const repoRoot = commonRoot(process.cwd());
  const store = openStore(repoRoot);
  try {
    return fn(store, repoRoot);
  } finally {
    store.close();
  }
}

function nextDecisionId(store: { db: { prepare(sql: string): { all(): unknown[] } } }): string {
  const rows = store.db.prepare('SELECT id FROM decisions ORDER BY id').all();
  let maxNum = 0;
  for (const row of rows) {
    const id = stringColumn(row, 'id');
    const match = /^DEC-(\d+)$/.exec(id);
    if (match !== null && match[1] !== undefined) {
      const num = parseInt(match[1], 10);
      if (num > maxNum) maxNum = num;
    }
  }
  return `DEC-${String(maxNum + 1).padStart(3, '0')}`;
}

function readDecision(store: { db: { prepare(sql: string): { get(...params: unknown[]): unknown } } }, id: string): DecisionRow | undefined {
  const row = store.db.prepare('SELECT id, question, answer, created_at, updated_at FROM decisions WHERE id = ?').get(id);
  if (row === undefined) return undefined;
  return {
    id: stringColumn(row, 'id'),
    question: stringColumn(row, 'question'),
    answer: nullableStringColumn(row, 'answer'),
    created_at: stringColumn(row, 'created_at'),
    updated_at: stringColumn(row, 'updated_at'),
  };
}

function handleAsk(args: string[], io: Io): number {
  const parsed = parseArgs({ args, allowPositionals: true, options: {
    packet: { type: 'string' },
  } });
  const question = parsed.positionals.join(' ');
  if (question === '') throw new UsageError('ask requires <question text...>');
  return withStore((store) => {
    const id = nextDecisionId(store);
    const now = new Date().toISOString();
    store.db.prepare('INSERT INTO decisions (id, question, answer, created_at, updated_at) VALUES (?, ?, NULL, ?, ?)').run(id, question, now, now);
    io.out(`asked ${id}`);
    return EXIT.OK;
  });
}

function handleAnswer(args: string[], io: Io): number {
  const [id, ...parts] = args;
  if (id === undefined || parts.length === 0) throw new UsageError('answer requires <ID> <answer text...>');
  const answer = parts.join(' ');
  return withStore((store) => {
    const dec = readDecision(store, id);
    if (dec === undefined) {
      io.err(`error: unknown decision: ${id}`);
      return EXIT.GATE_FAIL;
    }
    if (dec.answer !== null) {
      io.err(`error: decision ${id} is already answered`);
      return EXIT.GATE_FAIL;
    }
    const now = new Date().toISOString();
    store.db.prepare('UPDATE decisions SET answer = ?, updated_at = ? WHERE id = ?').run(answer, now, id);
    io.out(`answered ${id}`);
    return EXIT.OK;
  });
}

function handleList(args: string[], io: Io): number {
  const parsed = parseArgs({ args, allowPositionals: true, options: {
    pending: { type: 'boolean' },
  } });
  if (parsed.positionals.length !== 0) throw new UsageError('list takes no positional arguments');
  return withStore((store) => {
    const sql = parsed.values.pending === true
      ? 'SELECT id, question, answer, created_at, updated_at FROM decisions WHERE answer IS NULL ORDER BY created_at'
      : 'SELECT id, question, answer, created_at, updated_at FROM decisions ORDER BY created_at';
    const rows = store.db.prepare(sql).all();
    if (rows.length === 0) {
      io.out('no decisions');
      return EXIT.OK;
    }
    for (const row of rows) {
      const id = stringColumn(row, 'id');
      const answer = nullableStringColumn(row, 'answer');
      const status = answer === null ? 'pending' : 'answered';
      const question = stringColumn(row, 'question');
      io.out(`${id}\t${status}\t${question.substring(0, 60)}${question.length > 60 ? '...' : ''}`);
    }
    return EXIT.OK;
  });
}

function handleShow(args: string[], io: Io): number {
  const [id] = args;
  if (id === undefined || args.length !== 1) throw new UsageError('show requires <ID>');
  return withStore((store) => {
    const dec = readDecision(store, id);
    if (dec === undefined) {
      io.err(`error: unknown decision: ${id}`);
      return EXIT.GATE_FAIL;
    }
    io.out(`id: ${dec.id}`);
    io.out(`question: ${dec.question}`);
    io.out(`status: ${dec.answer === null ? 'pending' : 'answered'}`);
    if (dec.answer !== null) io.out(`answer: ${dec.answer}`);
    io.out(`created_at: ${dec.created_at}`);
    io.out(`updated_at: ${dec.updated_at}`);
    return EXIT.OK;
  });
}

const SUBCOMMANDS: ReadonlyMap<string, Subcommand> = new Map([
  ['ask', { usage: 'sv-playbook decision ask <question text...>', run: handleAsk }],
  ['answer', { usage: 'sv-playbook decision answer <ID> <answer text...>', run: handleAnswer }],
  ['list', { usage: 'sv-playbook decision list [--pending]', run: handleList }],
  ['show', { usage: 'sv-playbook decision show <ID>', run: handleShow }],
]);

const USAGE = ['Usage:', ...Array.from(SUBCOMMANDS.values()).map((s) => `  ${s.usage}`)].join('\n');

export const command: Command = {
  name: 'decision',
  summary: 'Ask, answer, list, and inspect architectural decisions',
  run(args, io) {
    try {
      const [sub, ...rest] = args;
      const c = sub === undefined ? undefined : SUBCOMMANDS.get(sub);
      if (c !== undefined) return Promise.resolve(c.run(rest, io));
      throw new UsageError(sub === undefined ? 'missing decision subcommand' : `unknown decision subcommand: ${sub}`);
    } catch (error) {
      if (error instanceof UsageError) {
        io.err(USAGE);
        io.err(`error: ${error.message}`);
        return Promise.resolve(EXIT.USAGE);
      }
      throw error;
    }
  },
};
