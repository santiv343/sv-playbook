import { parseArgs } from 'node:util';
import { EXIT } from '../command.constants.js';
import type { Command, Io } from '../command.types.js';
import { commonRoot, openStore } from '../../db/store.js';
import type { Store } from '../../db/store.types.js';
import { getCwd } from '../../runtime/context.js';
import {
  addTaskToSprint,
  closeSprint,
  createSprint,
  getBacklog,
  listSprints,
  removeTaskFromSprint,
  orderTasksInSprint,
  recordTaskCost,
  showSprint,
} from '../../sprints/service.js';
import { LifecycleError } from '../../tasks/service.errors.js';

interface Subcommand {
  usage: string;
  run(rest: string[], io: Io): number;
}

class UsageError extends Error {}

function stringValue(value: string | boolean | string[] | undefined, name: string): string {
  if (typeof value !== 'string' || value === '') throw new UsageError(`missing --${name}`);
  return value;
}

function withStore<T>(fn: (store: Store, repoRoot: string) => T): T {
  const repoRoot = commonRoot(getCwd());
  const store = openStore(repoRoot);
  try {
    return fn(store, repoRoot);
  } finally {
    store.close();
  }
}

const AMOUNT_NOT_POSITIVE = 'amount must be a positive number';

function ensureSprintOpen(store: Store, sprintId: string): void {
  const sprint = store.db.prepare('SELECT state FROM sprints WHERE id = ?').get(sprintId);
  if (sprint === undefined) throw new LifecycleError(`unknown sprint: ${sprintId}`);
}

function handleCreate(args: string[], io: Io): number {
  const parsed = parseArgs({ args, allowPositionals: true, options: {
    goal: { type: 'string' }, budget: { type: 'string' }, wip: { type: 'string' },
  } });
  if (parsed.positionals.length !== 0) throw new UsageError('create takes no positional arguments');
  const goal = stringValue(parsed.values.goal, 'goal');
  const budget = stringValue(parsed.values.budget, 'budget');
  const budgetNum = parseFloat(budget);
  if (Number.isNaN(budgetNum)) throw new UsageError('budget must be a number');
  const opts: { goal: string; budget: number; wip?: number } = { goal, budget: budgetNum };
  if (parsed.values.wip !== undefined) {
    const wipStr = stringValue(parsed.values.wip, 'wip');
    const wipNum = parseInt(wipStr, 10);
    if (Number.isNaN(wipNum)) throw new UsageError('--wip must be a number');
    opts.wip = wipNum;
  }
  return withStore((store) => {
    const id = createSprint(store, opts);
    io.out(`created ${id}`);
    return EXIT.OK;
  });
}

function handleGoal(args: string[], io: Io): number {
  const parsed = parseArgs({ args, allowPositionals: true, options: {
    text: { type: 'string' },
  } });
  const [sprintId] = parsed.positionals;
  if (sprintId === undefined || parsed.positionals.length !== 1) throw new UsageError('goal requires <SPRINT> --text <goal>');
  const text = stringValue(parsed.values.text, 'text');
  return withStore((store) => {
    ensureSprintOpen(store, sprintId);
    store.db.prepare('UPDATE sprints SET goal = ? WHERE id = ?').run(text, sprintId);
    io.out(`goal updated for ${sprintId}`);
    return EXIT.OK;
  });
}

function handleBudget(args: string[], io: Io): number {
  const parsed = parseArgs({ args, allowPositionals: true, options: {
    amount: { type: 'string' },
  } });
  const [sprintId] = parsed.positionals;
  if (sprintId === undefined || parsed.positionals.length !== 1) throw new UsageError('budget requires <SPRINT> --amount <usd>');
  const amount = stringValue(parsed.values.amount, 'amount');
  const budgetNum = parseFloat(amount);
  if (Number.isNaN(budgetNum) || budgetNum <= 0) throw new UsageError(AMOUNT_NOT_POSITIVE);
  return withStore((store) => {
    ensureSprintOpen(store, sprintId);
    store.db.prepare('UPDATE sprints SET budget_cap = ? WHERE id = ?').run(budgetNum, sprintId);
    io.out(`budget updated for ${sprintId}`);
    return EXIT.OK;
  });
}

function handleWip(args: string[], io: Io): number {
  const parsed = parseArgs({ args, allowPositionals: true, options: {
    limit: { type: 'string' },
  } });
  const [sprintId] = parsed.positionals;
  if (sprintId === undefined || parsed.positionals.length !== 1) throw new UsageError('wip requires <SPRINT> --limit <n>');
  const limit = stringValue(parsed.values.limit, 'limit');
  const wipNum = parseInt(limit, 10);
  if (Number.isNaN(wipNum) || wipNum < 1) throw new UsageError('limit must be a positive integer');
  return withStore((store) => {
    ensureSprintOpen(store, sprintId);
    store.db.prepare('UPDATE sprints SET wip_limit = ? WHERE id = ?').run(wipNum, sprintId);
    io.out(`wip updated for ${sprintId}`);
    return EXIT.OK;
  });
}

function handleAdd(args: string[], io: Io): number {
  const [sprintId, packetId] = args;
  if (args.length !== 2 || sprintId === undefined || packetId === undefined) throw new UsageError('add requires <SPRINT> <TASK-ID>');
  return withStore((store) => {
    addTaskToSprint(store, sprintId, packetId);
    io.out(`added ${packetId} to ${sprintId}`);
    return EXIT.OK;
  });
}

function handleRemove(args: string[], io: Io): number {
  const [sprintId, packetId] = args;
  if (args.length !== 2 || sprintId === undefined || packetId === undefined) throw new UsageError('remove requires <SPRINT> <TASK-ID>');
  return withStore((store) => {
    removeTaskFromSprint(store, sprintId, packetId);
    io.out(`removed ${packetId} from ${sprintId}`);
    return EXIT.OK;
  });
}

function handleOrder(args: string[], io: Io): number {
  const [sprintId, ...taskIds] = args;
  if (sprintId === undefined || taskIds.length === 0) throw new UsageError('order requires <SPRINT> <TASK-ID>...');
  return withStore((store) => {
    orderTasksInSprint(store, sprintId, taskIds);
    io.out(`ordered tasks in ${sprintId}`);
    return EXIT.OK;
  });
}

function handleShow(args: string[], io: Io): number {
  const [sprintId] = args;
  if (sprintId === undefined || args.length !== 1) throw new UsageError('show requires <SPRINT>');
  return withStore((store) => {
    const sprint = showSprint(store, sprintId);
    io.out(`id: ${sprint.id}`);
    io.out(`goal: ${sprint.goal}`);
    io.out(`state: ${sprint.state}`);
    io.out(`budget: $${sprint.budgetCap}`);
    io.out(`spent: $${sprint.spent}`);
    io.out(`wip: ${sprint.wipLimit === null ? 'none' : sprint.wipLimit}`);
    io.out(`created_at: ${sprint.createdAt}`);
    if (sprint.closedAt !== null) io.out(`closed_at: ${sprint.closedAt}`);
    io.out('tasks:');
    for (const t of sprint.tasks) io.out(`  ${t.id} \t${t.status} \t#${t.order}`);
    return EXIT.OK;
  });
}

function handleList(args: string[], io: Io): number {
  if (args.length !== 0) throw new UsageError('list takes no positional arguments');
  return withStore((store) => {
    const sprints = listSprints(store);
    if (sprints.length === 0) { io.out('no sprints'); return EXIT.OK; }
    for (const s of sprints) io.out(`${s.id}\t${s.state}\t${s.taskCount} tasks\t${s.goal.substring(0, 40)}`);
    return EXIT.OK;
  });
}

function handleClose(args: string[], io: Io): number {
  const [sprintId] = args;
  if (sprintId === undefined || args.length !== 1) throw new UsageError('close requires <SPRINT>');
  return withStore((store) => {
    closeSprint(store, sprintId);
    io.out(`closed ${sprintId}`);
    return EXIT.OK;
  });
}

function handleCost(args: string[], io: Io): number {
  const parsed = parseArgs({ args, allowPositionals: true, options: {
    amount: { type: 'string' },
  } });
  const [packetId] = parsed.positionals;
  if (packetId === undefined || parsed.positionals.length !== 1) throw new UsageError('cost requires <TASK-ID> --amount <usd>');
  const amount = stringValue(parsed.values.amount, 'amount');
  const amountNum = parseFloat(amount);
  if (Number.isNaN(amountNum) || amountNum <= 0) throw new UsageError(AMOUNT_NOT_POSITIVE);
  return withStore((store) => {
    recordTaskCost(store, packetId, amountNum);
    io.out(`recorded cost $${amountNum} on ${packetId}`);
    return EXIT.OK;
  });
}

function handleBacklog(args: string[], io: Io): number {
  if (args.length !== 0) throw new UsageError('backlog takes no positional arguments');
  return withStore((store) => {
    const tasks = getBacklog(store);
    if (tasks.length === 0) { io.out('backlog empty'); return EXIT.OK; }
    for (const t of tasks) io.out(`${t.id}\t${t.status}\t${t.title}`);
    return EXIT.OK;
  });
}

const SUBCOMMANDS: ReadonlyMap<string, Subcommand> = new Map([
  ['create', { usage: 'sv-playbook sprint create --goal <sentence> --budget <usd> [--wip <n>]', run: handleCreate }],
  ['goal', { usage: 'sv-playbook sprint goal <SPRINT> --text <goal>', run: handleGoal }],
  ['budget', { usage: 'sv-playbook sprint budget <SPRINT> --amount <usd>', run: handleBudget }],
  ['wip', { usage: 'sv-playbook sprint wip <SPRINT> --limit <n>', run: handleWip }],
  ['add', { usage: 'sv-playbook sprint add <SPRINT> <TASK-ID>', run: handleAdd }],
  ['remove', { usage: 'sv-playbook sprint remove <SPRINT> <TASK-ID>', run: handleRemove }],
  ['order', { usage: 'sv-playbook sprint order <SPRINT> <TASK-ID>...', run: handleOrder }],
  ['show', { usage: 'sv-playbook sprint show <SPRINT>', run: handleShow }],
  ['list', { usage: 'sv-playbook sprint list', run: handleList }],
  ['close', { usage: 'sv-playbook sprint close <SPRINT>', run: handleClose }],
  ['cost', { usage: 'sv-playbook sprint cost <TASK-ID> --amount <usd>', run: handleCost }],
  ['backlog', { usage: 'sv-playbook sprint backlog', run: handleBacklog }],
]);

const USAGE = ['Usage:', ...Array.from(SUBCOMMANDS.values()).map((s) => `  ${s.usage}`)].join('\n');

export const command: Command = {
  name: 'sprint',
  summary: 'Manage sprints: planning unit between milestone and task',
  run(args, io) {
    try {
      const [sub, ...rest] = args;
      const c = sub === undefined ? undefined : SUBCOMMANDS.get(sub);
      if (c !== undefined) return Promise.resolve(c.run(rest, io));
      throw new UsageError(sub === undefined ? 'missing sprint subcommand' : `unknown sprint subcommand: ${sub}`);
    } catch (error) {
      if (error instanceof LifecycleError) {
        io.err(`error: ${error.message}`);
        return Promise.resolve(EXIT.GATE_FAIL);
      }
      if (error instanceof UsageError) {
        io.err(USAGE); io.err(`error: ${error.message}`);
        return Promise.resolve(EXIT.USAGE);
      }
      throw error;
    }
  },
};
