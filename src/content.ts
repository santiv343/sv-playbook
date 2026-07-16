import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, sep } from 'node:path';
import { CONTENT_DIRECTORY_NAME, FILE_EXTENSION, PATH_TOKEN } from './platform.constants.js';

export function contentDir(): string {
  // dist/content.js -> package root -> content/
  return join(dirname(dirname(fileURLToPath(import.meta.url))), CONTENT_DIRECTORY_NAME);
}

export async function listTopicsIn(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: false });
  return entries
    .map(String)
    .filter((e) => e.endsWith(FILE_EXTENSION.MARKDOWN))
    .map((e) => e.replaceAll(sep, PATH_TOKEN.POSIX_SEPARATOR).replace(/\.md$/, ''))
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
