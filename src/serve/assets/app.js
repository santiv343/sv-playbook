import { createIcons, icons } from '/assets/icons.mjs';

const state = { dashboard: null, action: null, notified: new Set() };
const WORKFLOW_STATUS = { RUNNING: 'running', WAITING: 'waiting', FAILED: 'failed' };
const EFFECT_STATUS = { COMPLETED: 'completed' };
const GATEWAY_RUN_STATUS = { OBSERVING: 'observing' };
const AGENT_ACTIVITY_LABEL = {
  starting: 'iniciando', thinking: 'pensando', 'using-tool': 'usando herramienta',
  responding: 'respondiendo', terminal: 'terminado', unknown: 'sin datos',
};
const NOTIFICATION_PERMISSION = { GRANTED: 'granted' };
const ELEMENT_ID = {
  INTAKE_DIALOG: 'intake-dialog',
  INTAKE_ERROR: 'intake-error',
  INTAKE_MESSAGE: 'intake-message',
  RESOLUTION_DIALOG: 'resolution-dialog',
  RESOLUTION_ERROR: 'resolution-error',
  RESOLUTION_OUTPUT: 'resolution-output',
  TASK_SEARCH: 'task-search',
  TASK_STATUS_FILTER: 'task-status-filter',
};
const API_ROUTE = {
  DASHBOARD: '/api/dashboard',
  EVENTS: '/api/events',
  INTAKE: '/api/intake',
};
const HTTP_METHOD = { POST: 'POST' };
const byId = (id) => document.getElementById(id);
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]);
const empty = (label) => `<div class="empty">${escapeHtml(label)}</div>`;
const time = (value) => value ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--';
const statusLabel = (value) => String(value ?? 'unknown').replaceAll('-', ' ');

function effectProgress(workflowId) {
  const effects = state.dashboard.workflow.effects.filter((effect) => effect.workflowId === workflowId);
  const completed = effects.filter((effect) => effect.status === EFFECT_STATUS.COMPLETED).length;
  return { completed, total: effects.length, percent: effects.length === 0 ? 0 : Math.round(completed * 100 / effects.length) };
}

function renderMetrics() {
  const { board, workflow } = state.dashboard;
  const running = workflow.workflows.filter((item) => item.status === WORKFLOW_STATUS.RUNNING).length;
  const waiting = workflow.humanActions.length;
  const failed = workflow.workflows.filter((item) => item.status === WORKFLOW_STATUS.FAILED).length;
  const activeTasks = (board.counts.active ?? 0) + (board.counts.review ?? 0);
  const liveAgents = workflow.agentRuns.filter((item) => item.status === GATEWAY_RUN_STATUS.OBSERVING).length;
  const metrics = [
    ['Workflows activos', running], ['Decisiones', waiting], ['Fallos', failed], ['Tareas activas', activeTasks], ['Agentes vivos', liveAgents],
  ];
  byId('metrics').innerHTML = metrics.map(([label, value], index) => `<div class="metric"><span class="metric-label">${label}</span><strong class="metric-value ${index === 1 && value > 0 ? 'alert' : ''}">${value}</strong></div>`).join('');
}

function workflowItem(item) {
  const progress = effectProgress(item.id);
  const agentRun = state.dashboard.workflow.agentRuns.filter((run) => run.workflowId === item.id).at(-1);
  const agentState = agentRun ? ` · agente ${statusLabel(agentRun.status)} · progreso ${time(agentRun.lastProgressAt)}` : '';
  return `<article class="workflow-item"><span class="status-dot ${escapeHtml(item.status)}"></span><div><div class="item-title">${escapeHtml(item.subjectRef)}</div><div class="item-meta">${escapeHtml(item.currentStepKey ?? 'completado')} · ${escapeHtml(item.definitionId)} · ${progress.completed}/${progress.total}${escapeHtml(agentState)}</div></div><div class="progress" title="${progress.percent}%"><span style="width:${progress.percent}%"></span></div></article>`;
}

function renderOverview() {
  const workflows = state.dashboard.workflow.workflows.filter((item) => (
    item.status === WORKFLOW_STATUS.RUNNING || item.status === WORKFLOW_STATUS.WAITING
  ));
  byId('running-count').textContent = String(workflows.length);
  byId('running').innerHTML = workflows.length ? workflows.map(workflowItem).join('') : empty('Sin workflows activos');
  const actions = state.dashboard.workflow.humanActions;
  byId('action-count').textContent = String(actions.length);
  byId('human-actions').innerHTML = actions.length ? actions.map((action) => `<article class="action-item"><header><div><div class="item-title">${escapeHtml(action.subjectRef)}</div><div class="item-meta">${escapeHtml(action.stepKey)} · ${time(action.createdAt)}</div></div><button class="primary-button resolve" type="button" data-effect="${escapeHtml(action.effectId)}">Resolver</button></header><span class="action-contract">${escapeHtml(action.outputContractRef)}</span></article>`).join('') : empty('Sin decisiones pendientes');
}

function eventRows(events) {
  return events.slice().reverse().map((event) => `<div class="event-row"><span class="event-time">${time(event.createdAt)}</span><span class="event-kind">${escapeHtml(statusLabel(event.eventType))}</span><span class="event-payload">${escapeHtml(JSON.stringify(event.payload))}</span><span class="event-step">${escapeHtml(event.stepKey ?? '')}</span></div>`).join('');
}

function renderEvents() {
  const events = state.dashboard.workflow.events;
  byId('recent-events').innerHTML = events.length ? eventRows(events) : empty('Sin actividad registrada');
  byId('all-events').innerHTML = events.length ? eventRows(events) : empty('Sin eventos');
  byId('event-count').textContent = String(events.length);
}

function renderWorkflowTable() {
  const workflows = state.dashboard.workflow.workflows;
  byId('workflow-count').textContent = String(workflows.length);
  byId('workflow-rows').innerHTML = workflows.map((item) => {
    const progress = effectProgress(item.id);
    return `<tr><td><span class="status-badge ${escapeHtml(item.status)}">${escapeHtml(statusLabel(item.status))}</span></td><td><strong>${escapeHtml(item.subjectRef)}</strong><div class="item-meta">${escapeHtml(item.definitionId)}@${item.definitionVersion}</div></td><td>${escapeHtml(item.currentStepKey ?? '--')}</td><td>${progress.completed}/${progress.total}</td><td>${time(item.updatedAt)}</td></tr>`;
  }).join('');
}

function syncTaskStatusFilter(tasks) {
  const select = byId(ELEMENT_ID.TASK_STATUS_FILTER);
  const current = select.value;
  const statuses = [...new Set(tasks.map((task) => task.status))].sort();
  select.innerHTML = `<option value="">Todos los estados</option>${statuses.map((status) => `<option value="${escapeHtml(status)}">${escapeHtml(statusLabel(status))}</option>`).join('')}`;
  if (statuses.includes(current)) select.value = current;
}

function renderTasks() {
  const tasks = state.dashboard.board.packets;
  syncTaskStatusFilter(tasks);
  const query = byId(ELEMENT_ID.TASK_SEARCH).value.trim().toLocaleLowerCase();
  const status = byId(ELEMENT_ID.TASK_STATUS_FILTER).value;
  const filtered = tasks.filter((task) => (
    (status.length === 0 || task.status === status)
    && (query.length === 0 || `${task.id} ${task.title}`.toLocaleLowerCase().includes(query))
  ));
  byId('task-count').textContent = `${filtered.length}/${tasks.length}`;
  byId('task-rows').innerHTML = filtered.length ? filtered.map((task) => `<tr><td><span class="status-badge ${escapeHtml(task.status)}">${escapeHtml(task.status)}</span></td><td><strong>${escapeHtml(task.id)}</strong></td><td>${escapeHtml(task.title)}</td><td>${task.lease ? escapeHtml(task.lease.sessionId) : '--'}</td><td>${task.lastEvent ? escapeHtml(task.lastEvent.command) : '--'}</td></tr>`).join('') : `<tr><td colspan="5">${empty('Sin tareas para este filtro')}</td></tr>`;
}

function renderAgents() {
  const runs = state.dashboard.workflow.agentRuns.slice().reverse();
  byId('agent-count').textContent = String(runs.length);
  byId('agent-rows').innerHTML = runs.length ? runs.map((run) => `<tr><td><span class="status-badge ${escapeHtml(run.status)}">${escapeHtml(statusLabel(run.status))}</span></td><td>${escapeHtml(AGENT_ACTIVITY_LABEL[run.activity] ?? run.activity)}</td><td><strong>${escapeHtml(run.roleId)}</strong><div class="item-meta">${escapeHtml(run.phase)}</div></td><td>${escapeHtml(run.workflowId)}</td><td>${time(run.lastProgressAt)}</td><td>${escapeHtml(run.observedToolIds.join(', ') || '--')}</td><td><span class="agent-detail" title="${escapeHtml(run.detail ?? '')}">${escapeHtml(run.detail ?? '--')}</span></td></tr>`).join('') : `<tr><td colspan="7">${empty('Sin ejecuciones de agentes')}</td></tr>`;
}

function renderPromotions() {
  const promotions = state.dashboard.promotions ?? [];
  byId('promotion-count').textContent = String(promotions.length);
  byId('promotion-rows').innerHTML = promotions.length ? promotions.map((promotion) => `<tr><td><span class="status-badge ${escapeHtml(promotion.status)}">${escapeHtml(statusLabel(promotion.status))}</span></td><td><strong>${escapeHtml(promotion.taskId)}</strong><div class="item-meta" title="${escapeHtml(promotion.candidateId)}">${escapeHtml(promotion.candidateId)}</div></td><td><code title="${escapeHtml(promotion.candidateSha)}">${escapeHtml(promotion.candidateSha.slice(0, 12))}</code></td><td>${escapeHtml(promotion.targetRef ?? '--')}</td><td>${escapeHtml(statusLabel(promotion.integrationOutcome ?? '--'))}</td><td><span title="${escapeHtml(promotion.receiptId ?? '')}">${escapeHtml(promotion.receiptId ?? '--')}</span></td><td>${time(promotion.updatedAt)}</td></tr>`).join('') : `<tr><td colspan="7">${empty('Sin promociones registradas')}</td></tr>`;
}

function notifyActions() {
  if (Notification.permission !== NOTIFICATION_PERMISSION.GRANTED) return;
  for (const action of state.dashboard.workflow.humanActions) {
    if (state.notified.has(action.effectId)) continue;
    state.notified.add(action.effectId);
    new Notification('sv-playbook: decisión requerida', { body: `${action.subjectRef} · ${action.stepKey}` });
  }
}

function render(value) {
  state.dashboard = value;
  renderMetrics();
  renderOverview();
  renderEvents();
  renderWorkflowTable();
  renderTasks();
  renderAgents();
  renderPromotions();
  byId('updated').textContent = time(value.generatedAt);
  createIcons({ icons });
  notifyActions();
}

async function load() {
  const response = await fetch(API_ROUTE.DASHBOARD);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  render(await response.json());
}

function setConnection(mode, label) {
  const element = byId('connection');
  element.className = `connection ${mode}`;
  element.querySelector('span').textContent = label;
}

function connect() {
  const source = new EventSource(API_ROUTE.EVENTS);
  source.addEventListener('dashboard', (event) => {
    setConnection('online', 'En vivo');
    render(JSON.parse(event.data));
  });
  source.onerror = () => {
    setConnection('offline', 'Reconectando');
    source.close();
    setTimeout(connect, 2000);
  };
}

function openView(view) {
  document.querySelectorAll('.tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.view === view));
  document.querySelectorAll('.view').forEach((panel) => panel.classList.toggle('active', panel.dataset.panel === view));
}

function openResolution(effectId) {
  const action = state.dashboard.workflow.humanActions.find((item) => item.effectId === effectId);
  if (!action) return;
  state.action = action;
  byId('resolution-title').textContent = action.subjectRef;
  byId('input-contract').textContent = action.inputContractRef;
  byId('output-contract').textContent = action.outputContractRef;
  byId(ELEMENT_ID.RESOLUTION_OUTPUT).value = action.inputContractRef === action.outputContractRef ? JSON.stringify(action.input, null, 2) : '{}';
  byId(ELEMENT_ID.RESOLUTION_ERROR).textContent = '';
  byId(ELEMENT_ID.RESOLUTION_DIALOG).showModal();
  createIcons({ icons });
}

async function submitResolution(event) {
  event.preventDefault();
  if (!state.action) return;
  try {
    const output = JSON.parse(byId(ELEMENT_ID.RESOLUTION_OUTPUT).value);
    const response = await fetch(`/api/human-effects/${encodeURIComponent(state.action.effectId)}/resolve`, {
      method: HTTP_METHOD.POST, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resolvedBy: byId('resolved-by').value, output }),
    });
    const value = await response.json();
    if (!response.ok) throw new Error(value.error ?? `HTTP ${response.status}`);
    byId(ELEMENT_ID.RESOLUTION_DIALOG).close();
    await load();
  } catch (error) {
    byId(ELEMENT_ID.RESOLUTION_ERROR).textContent = error instanceof Error ? error.message : String(error);
  }
}

function openIntake() {
  byId(ELEMENT_ID.INTAKE_ERROR).textContent = '';
  byId(ELEMENT_ID.INTAKE_DIALOG).showModal();
  byId(ELEMENT_ID.INTAKE_MESSAGE).focus();
}

async function submitIntake(event) {
  event.preventDefault();
  const message = byId(ELEMENT_ID.INTAKE_MESSAGE).value.trim();
  if (message.length === 0) return;
  try {
    const response = await fetch(API_ROUTE.INTAKE, {
      method: HTTP_METHOD.POST,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    });
    const value = await response.json();
    if (!response.ok) throw new Error(value.error ?? `HTTP ${response.status}`);
    byId(ELEMENT_ID.INTAKE_DIALOG).close();
    byId(ELEMENT_ID.INTAKE_MESSAGE).value = '';
    openView('overview');
    await load();
  } catch (error) {
    byId(ELEMENT_ID.INTAKE_ERROR).textContent = error instanceof Error ? error.message : String(error);
  }
}

document.addEventListener('click', (event) => {
  const target = event.target.closest('button');
  if (!target) return;
  if (target.dataset.view) openView(target.dataset.view);
  if (target.dataset.openView) openView(target.dataset.openView);
  if (target.dataset.effect) openResolution(target.dataset.effect);
});
byId('refresh').addEventListener('click', () => { void load(); });
byId('new-work').addEventListener('click', openIntake);
byId('cancel-intake').addEventListener('click', () => { byId(ELEMENT_ID.INTAKE_DIALOG).close(); });
byId('intake-form').addEventListener('submit', submitIntake);
byId(ELEMENT_ID.TASK_SEARCH).addEventListener('input', renderTasks);
byId(ELEMENT_ID.TASK_STATUS_FILTER).addEventListener('change', renderTasks);
byId('cancel-resolution').addEventListener('click', () => { byId(ELEMENT_ID.RESOLUTION_DIALOG).close(); });
byId('resolution-form').addEventListener('submit', submitResolution);
byId('notifications').addEventListener('click', async () => {
  if (!('Notification' in window)) return;
  const permission = await Notification.requestPermission();
  byId('notifications').classList.toggle('enabled', permission === NOTIFICATION_PERMISSION.GRANTED);
});

createIcons({ icons });
void load().catch(() => { setConnection('offline', 'Sin conexión'); });
connect();
