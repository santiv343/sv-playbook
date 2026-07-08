import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, sep } from 'node:path';

export function contentDir(): string {
  // dist/content.js -> package root -> content/
  return join(dirname(dirname(fileURLToPath(import.meta.url))), 'content');
}

export async function listTopicsIn(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: false });
  return entries
    .map(String)
    .filter((e) => e.endsWith('.md'))
    .map((e) => e.replaceAll(sep, '/').replace(/\.md$/, ''))
    .sort();
}

export async function readTopicIn(dir: string, topic: string): Promise<string | undefined> {
  const target = resolve(dir, `${topic}.md`);
  if (!target.startsWith(resolve(dir) + sep)) return undefined; // traversal guard
  try {
    return await readFile(target, 'utf8');
  } catch {
    return undefined;
  }
}

export function listTopics(): Promise<string[]> {
  return listTopicsIn(contentDir());
}

export function readTopic(topic: string): Promise<string | undefined> {
  return readTopicIn(contentDir(), topic);
}
