import type { Store } from '../db/store.types.js';
import { numberColumn, stringColumn } from '../db/rows.js';
import { LifecycleError } from '../tasks/service.errors.js';
import { SPRINT_STATE, GET_SPRINT_SQL } from './service.constants.js';
import type { SprintCreateOptions, SprintSummary } from './service.types.js';

const now = (): string => new Date().toISOString();

function transact(store: Store, fn: () => void): void {
  const { db } = store;
  try { db.exec('BEGIN IMMEDIATE'); fn(); db.exec('COMMIT'); }
  catch (error) { try { db.exec('ROLLBACK'); } catch {} throw error; }
}

function columnValue(row: unknown, key: string): unknown {
  if (typeof row !== 'object' || row === null) return undefined;
  for (const [candidate, value] of Object.entries(row)) {
    if (candidate === key) return value;
  }
  return undefined;
}

function nextSprintId(store: Store): string {
  const rows = store.db.prepare("SELECT id FROM sprints WHERE id LIKE 'S%' ORDER BY id").all();
  let maxNum = 0;
  for (const row of rows) {
    const match = /^S-(\d+)$/.exec(stringColumn(row, 'id'));
    if (match !== null && match[1] !== undefined) {
      const num = parseInt(match[1], 10);
      if (num > maxNum) maxNum = num;
    }
  }
  return `S-${String(maxNum + 1).padStart(3, '0')}`;
}

export function createSprint(store: Store, opts: SprintCreateOptions): string {
  const id = nextSprintId(store);
  const goal = opts.goal.trim();
  if (goal.length === 0) throw new LifecycleError('sprint goal is required');
  if (opts.budget <= 0) throw new LifecycleError('budget must be positive');
  if (opts.wip !== undefined && opts.wip < 1) throw new LifecycleError('wip limit must be >= 1');
  transact(store, () => {
    store.db.prepare(
      'INSERT INTO sprints (id, goal, budget_cap, wip_limit, state, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(id, goal, opts.budget, opts.wip ?? null, SPRINT_STATE.OPEN, now());
  });
  return id;
}

export function addTaskToSprint(store: Store, sprintId: string, packetId: string): void {
  const sprint = store.db.prepare(GET_SPRINT_SQL).get(sprintId);
  if (sprint === undefined) throw new LifecycleError(`unknown sprint: ${sprintId}`);
  if (stringColumn(sprint, 'state') !== SPRINT_STATE.OPEN) throw new LifecycleError('cannot add to a closed sprint');
  const pkt = store.db.prepare('SELECT 1 FROM packets WHERE id = ?').get(packetId);
  if (pkt === undefined) throw new LifecycleError(`unknown packet: ${packetId}`);
  const maxRow = store.db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS max_order FROM sprint_tasks WHERE sprint_id = ?').get(sprintId);
  const nextOrder = numberColumn(maxRow, 'max_order') + 1;
  transact(store, () => {
    store.db.prepare('INSERT OR IGNORE INTO sprint_tasks (sprint_id, packet_id, sort_order) VALUES (?, ?, ?)').run(sprintId, packetId, nextOrder);
  });
}

export function removeTaskFromSprint(store: Store, sprintId: string, packetId: string): void {
  store.db.prepare('DELETE FROM sprint_tasks WHERE sprint_id = ? AND packet_id = ?').run(sprintId, packetId);
}

export function orderTasksInSprint(store: Store, sprintId: string, taskIds: string[]): void {
  const sprint = store.db.prepare(GET_SPRINT_SQL).get(sprintId);
  if (sprint === undefined) throw new LifecycleError(`unknown sprint: ${sprintId}`);
  if (stringColumn(sprint, 'state') !== SPRINT_STATE.OPEN) throw new LifecycleError('cannot reorder a closed sprint');
  transact(store, () => {
    for (let i = 0; i < taskIds.length; i++) {
      const tid = taskIds[i];
      if (tid === undefined) continue;
      const existing = store.db.prepare('SELECT 1 FROM sprint_tasks WHERE sprint_id = ? AND packet_id = ?').get(sprintId, tid);
      if (existing === undefined) throw new LifecycleError(`task ${tid} is not in sprint ${sprintId}`);
      store.db.prepare('UPDATE sprint_tasks SET sort_order = ? WHERE sprint_id = ? AND packet_id = ?').run(i, sprintId, tid);
    }
  });
}

export function recordTaskCost(store: Store, packetId: string, amount: number, recordedBy?: string): void {
  if (amount <= 0) throw new LifecycleError('cost amount must be positive');
  store.db.prepare('INSERT INTO task_costs (packet_id, amount, recorded_by, recorded_at) VALUES (?, ?, ?, ?)').run(packetId, amount, recordedBy ?? null, now());
}

export function sprintSpent(store: Store, sprintId: string): number {
  const rows = store.db.prepare(
    'SELECT COALESCE(SUM(tc.amount), 0) AS total FROM task_costs tc JOIN sprint_tasks st ON tc.packet_id = st.packet_id WHERE st.sprint_id = ?',
  ).get(sprintId);
  return numberColumn(rows, 'total');
}

export function showSprint(store: Store, sprintId: string): SprintSummary {
  const sprint = store.db.prepare('SELECT id, goal, budget_cap, wip_limit, state, created_at, closed_at FROM sprints WHERE id = ?').get(sprintId);
  if (sprint === undefined) throw new LifecycleError(`unknown sprint: ${sprintId}`);
  const tasks = store.db.prepare(
    'SELECT st.packet_id, st.sort_order, p.status FROM sprint_tasks st JOIN packets p ON st.packet_id = p.id WHERE st.sprint_id = ? ORDER BY st.sort_order',
  ).all(sprintId);
  const spent = sprintSpent(store, sprintId);
  return {
    id: stringColumn(sprint, 'id'),
    goal: stringColumn(sprint, 'goal'),
    budgetCap: numberColumn(sprint, 'budget_cap'),
    spent,
    wipLimit: columnValue(sprint, 'wip_limit') === null || columnValue(sprint, 'wip_limit') === undefined
      ? null
      : numberColumn(sprint, 'wip_limit'),
    state: stringColumn(sprint, 'state'),
    createdAt: stringColumn(sprint, 'created_at'),
    closedAt: columnValue(sprint, 'closed_at') === null || columnValue(sprint, 'closed_at') === undefined
      ? null
      : stringColumn(sprint, 'closed_at'),
    tasks: tasks.map((t: unknown) => ({
      id: stringColumn(t, 'packet_id'),
      status: stringColumn(t, 'status'),
      order: numberColumn(t, 'sort_order'),
    })),
  };
}

export function listSprints(store: Store): Array<{ id: string; goal: string; state: string; taskCount: number }> {
  const rows = store.db.prepare('SELECT id, goal, state FROM sprints ORDER BY id').all();
  return rows.map((row: unknown) => {
    const id = stringColumn(row, 'id');
    const countRow = store.db.prepare('SELECT COUNT(*) AS cnt FROM sprint_tasks WHERE sprint_id = ?').get(id);
    return {
      id,
      goal: stringColumn(row, 'goal'),
      state: stringColumn(row, 'state'),
      taskCount: numberColumn(countRow, 'cnt'),
    };
  });
}

export function closeSprint(store: Store, sprintId: string): void {
  const sprint = store.db.prepare(GET_SPRINT_SQL).get(sprintId);
  if (sprint === undefined) throw new LifecycleError(`unknown sprint: ${sprintId}`);
  if (stringColumn(sprint, 'state') !== SPRINT_STATE.OPEN) throw new LifecycleError('sprint is already closed');
  const openTasks = store.db.prepare(
    "SELECT st.packet_id, p.status FROM sprint_tasks st JOIN packets p ON st.packet_id = p.id WHERE st.sprint_id = ? AND p.status NOT IN ('done', 'dropped')",
  ).all(sprintId);
  if (openTasks.length > 0) {
    const ids = openTasks.map((t: unknown) => stringColumn(t, 'packet_id')).join(', ');
    throw new LifecycleError(`sprint has non-terminal tasks: ${ids} — move them to done/dropped or remove from sprint before closing`);
  }
  transact(store, () => {
    store.db.prepare('UPDATE sprints SET state = ?, closed_at = ? WHERE id = ?').run(SPRINT_STATE.CLOSED, now(), sprintId);
  });
}

export function getBacklog(store: Store): Array<{ id: string; title: string; status: string }> {
  const rows = store.db.prepare(
    `SELECT id, title, status FROM packets WHERE id NOT IN (
      SELECT st.packet_id FROM sprint_tasks st JOIN sprints s ON st.sprint_id = s.id WHERE s.state = 'open'
    ) ORDER BY id`,
  ).all();
  return rows.map((row: unknown) => ({
    id: stringColumn(row, 'id'),
    title: stringColumn(row, 'title'),
    status: stringColumn(row, 'status'),
  }));
}

export function getActiveCount(store: Store, sprintId: string): number {
  const row = store.db.prepare(
    "SELECT COUNT(*) AS cnt FROM sprint_tasks st JOIN packets p ON st.packet_id = p.id WHERE st.sprint_id = ? AND p.status = 'active'",
  ).get(sprintId);
  return numberColumn(row, 'cnt');
}

export function sprintWipLimit(store: Store, sprintId: string): number | null {
  const row = store.db.prepare('SELECT wip_limit FROM sprints WHERE id = ?').get(sprintId);
  if (row === undefined) return null;
  const v = columnValue(row, 'wip_limit');
  if (v === null || v === undefined) return null;
  return numberColumn(row, 'wip_limit');
}

export function taskSprintId(store: Store, packetId: string): string | null {
  const row = store.db.prepare(
    "SELECT st.sprint_id FROM sprint_tasks st JOIN sprints s ON st.sprint_id = s.id WHERE st.packet_id = ? AND s.state = 'open'",
  ).get(packetId);
  if (row === undefined) return null;
  return stringColumn(row, 'sprint_id');
}
