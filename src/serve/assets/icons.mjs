/**
 * Vendored subset of lucide v1.24.0 (https://lucide.dev) — ISC license.
 * See the LICENSE file in the lucide source tree (lucide-icons/lucide).
 *
 * Only the icons referenced by `data-lucide` attributes in index.html are
 * kept, in lucide's icon-node format ([tag, attrs] children of the root svg).
 * `createIcons` is a minimal port of lucide's DOM replacement for that subset:
 * it swaps every `[data-lucide]` element for an inline svg and stays
 * idempotent across re-renders (the svg carries `data-lucide`, so subsequent
 * passes replace it with an identical fresh node).
 */

const NAME_ATTR = 'data-lucide';
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

const defaultAttributes = {
  xmlns: SVG_NAMESPACE,
  width: 24,
  height: 24,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  'stroke-width': 2,
  'stroke-linecap': 'round',
  'stroke-linejoin': 'round',
};

// CircleHelp and TerminalSquare are the upstream aliases of CircleQuestionMark
// and SquareTerminal; the kebab names used in index.html resolve to these keys.
export const icons = {
  Activity: [
    ['path', { d: 'M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2' }],
  ],
  Bell: [
    ['path', { d: 'M10.268 21a2 2 0 0 0 3.464 0' }],
    ['path', { d: 'M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326' }],
  ],
  Check: [
    ['path', { d: 'M20 6 9 17l-5-5' }],
  ],
  CircleCheck: [
    ['circle', { cx: '12', cy: '12', r: '10' }],
    ['path', { d: 'm9 12 2 2 4-4' }],
  ],
  CircleHelp: [
    ['circle', { cx: '12', cy: '12', r: '10' }],
    ['path', { d: 'M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3' }],
    ['path', { d: 'M12 17h.01' }],
  ],
  Cpu: [
    ['path', { d: 'M12 20v2' }],
    ['path', { d: 'M12 2v2' }],
    ['path', { d: 'M17 20v2' }],
    ['path', { d: 'M17 2v2' }],
    ['path', { d: 'M2 12h2' }],
    ['path', { d: 'M2 17h2' }],
    ['path', { d: 'M2 7h2' }],
    ['path', { d: 'M20 12h2' }],
    ['path', { d: 'M20 17h2' }],
    ['path', { d: 'M20 7h2' }],
    ['path', { d: 'M7 20v2' }],
    ['path', { d: 'M7 2v2' }],
    ['rect', { x: '4', y: '4', width: '16', height: '16', rx: '2' }],
    ['rect', { x: '8', y: '8', width: '8', height: '8', rx: '1' }],
  ],
  History: [
    ['path', { d: 'M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8' }],
    ['path', { d: 'M3 3v5h5' }],
    ['path', { d: 'M12 7v5l4 2' }],
  ],
  ListChecks: [
    ['path', { d: 'M13 5h8' }],
    ['path', { d: 'M13 12h8' }],
    ['path', { d: 'M13 19h8' }],
    ['path', { d: 'm3 17 2 2 4-4' }],
    ['path', { d: 'm3 7 2 2 4-4' }],
  ],
  MessageSquareText: [
    ['path', { d: 'M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z' }],
    ['path', { d: 'M7 11h10' }],
    ['path', { d: 'M7 15h6' }],
    ['path', { d: 'M7 7h8' }],
  ],
  PackageCheck: [
    ['path', { d: 'M12 22V12' }],
    ['path', { d: 'm16 17 2 2 4-4' }],
    ['path', { d: 'M21 11.127V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.729l7 4a2 2 0 0 0 2 .001l1.32-.753' }],
    ['path', { d: 'M3.29 7 12 12l8.71-5' }],
    ['path', { d: 'm7.5 4.27 8.997 5.148' }],
  ],
  Plus: [
    ['path', { d: 'M5 12h14' }],
    ['path', { d: 'M12 5v14' }],
  ],
  Radio: [
    ['path', { d: 'M16.247 7.761a6 6 0 0 1 0 8.478' }],
    ['path', { d: 'M19.075 4.933a10 10 0 0 1 0 14.134' }],
    ['path', { d: 'M4.925 19.067a10 10 0 0 1 0-14.134' }],
    ['path', { d: 'M7.753 16.239a6 6 0 0 1 0-8.478' }],
    ['circle', { cx: '12', cy: '12', r: '2' }],
  ],
  RefreshCw: [
    ['path', { d: 'M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8' }],
    ['path', { d: 'M21 3v5h-5' }],
    ['path', { d: 'M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16' }],
    ['path', { d: 'M8 16H3v5' }],
  ],
  Route: [
    ['circle', { cx: '6', cy: '19', r: '3' }],
    ['path', { d: 'M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15' }],
    ['circle', { cx: '18', cy: '5', r: '3' }],
  ],
  ScanSearch: [
    ['path', { d: 'M3 7V5a2 2 0 0 1 2-2h2' }],
    ['path', { d: 'M17 3h2a2 2 0 0 1 2 2v2' }],
    ['path', { d: 'M21 17v2a2 2 0 0 1-2 2h-2' }],
    ['path', { d: 'M7 21H5a2 2 0 0 1-2-2v-2' }],
    ['circle', { cx: '12', cy: '12', r: '3' }],
    ['path', { d: 'm16 16-1.9-1.9' }],
  ],
  Search: [
    ['path', { d: 'm21 21-4.34-4.34' }],
    ['circle', { cx: '11', cy: '11', r: '8' }],
  ],
  Send: [
    ['path', { d: 'M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z' }],
    ['path', { d: 'm21.854 2.147-10.94 10.939' }],
  ],
  TerminalSquare: [
    ['path', { d: 'm7 11 2-2-2-2' }],
    ['path', { d: 'M11 13h4' }],
    ['rect', { width: '18', height: '18', x: '3', y: '3', rx: '2', ry: '2' }],
  ],
  Workflow: [
    ['rect', { width: '8', height: '8', x: '3', y: '3', rx: '2' }],
    ['path', { d: 'M7 11v4a2 2 0 0 0 2 2h4' }],
    ['rect', { width: '8', height: '8', x: '13', y: '13', rx: '2' }],
  ],
  X: [
    ['path', { d: 'M18 6 6 18' }],
    ['path', { d: 'm6 6 12 12' }],
  ],
};

function toPascalCase(value) {
  return value.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('');
}

function createSvgElement([tag, attrs, children]) {
  const element = document.createElementNS(SVG_NAMESPACE, tag);
  for (const [name, value] of Object.entries(attrs)) element.setAttribute(name, String(value));
  for (const child of children ?? []) element.appendChild(createSvgElement(child));
  return element;
}

function mergeClassNames(name, existing) {
  const parts = ['lucide', `lucide-${name}`, ...(existing === null ? [] : existing.split(' '))];
  return [...new Set(parts.filter((part) => part.length > 0))].join(' ');
}

function replaceElement(element, iconSet) {
  const name = element.getAttribute(NAME_ATTR);
  if (name === null) return;
  const iconNode = iconSet[toPascalCase(name)];
  if (iconNode === undefined) {
    console.warn(`${element.outerHTML} icon name was not found in the provided icons object.`);
    return;
  }
  const attrs = { ...defaultAttributes, [NAME_ATTR]: name, 'aria-hidden': 'true' };
  for (const attr of Array.from(element.attributes)) {
    if (attr.name !== NAME_ATTR && attr.name !== 'class') attrs[attr.name] = attr.value;
  }
  attrs.class = mergeClassNames(name, element.getAttribute('class'));
  element.parentNode?.replaceChild(createSvgElement(['svg', attrs, iconNode]), element);
}

export function createIcons({ icons: provided = icons, root = document } = {}) {
  for (const element of Array.from(root.querySelectorAll(`[${NAME_ATTR}]`))) {
    replaceElement(element, provided);
  }
}
