import { readFileSync } from 'node:fs';
import { ContextError } from '../context.errors.js';

interface Heading {
  level: number;
  title: string;
}

function parseHeading(line: string): Heading | undefined {
  const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
  if (match?.[1] === undefined || match[2] === undefined) return undefined;
  return { level: match[1].length, title: match[2] };
}

export function readMarkdownSection(path: string, title: string): string {
  const lines = readFileSync(path, 'utf8').split(/\r?\n/);
  const start = lines.findIndex((line) => parseHeading(line)?.title === title);
  if (start < 0) throw new ContextError('MISSING_IMPORT_SECTION', `missing Markdown heading "${title}" in ${path}`);
  const heading = parseHeading(lines[start] ?? '');
  if (heading === undefined) throw new ContextError('INVALID_IMPORT_SECTION', `invalid Markdown heading "${title}" in ${path}`);
  let end = start + 1;
  while (end < lines.length) {
    const candidate = parseHeading(lines[end] ?? '');
    if (candidate !== undefined && candidate.level <= heading.level) break;
    end++;
  }
  return `${lines.slice(start, end).join('\n').trimEnd()}\n`;
}
