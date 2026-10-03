// Tiny recursive file walker - no glob dependency needed for the fixed set of
// directories this tool indexes (docs/, ops/, .claude/, src/, scripts/, pipeline/).
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const SKIP_DIRS = new Set(['node_modules', '.git', '.cache']);

/**
 * Recursively list files under `rootDir` whose extension is in `extensions`
 * (e.g. ['.md']). Returns absolute paths. Silently skips a root that does
 * not exist.
 */
export function walkFiles(rootDir, extensions) {
  const results = [];
  let rootStat;
  try {
    rootStat = statSync(rootDir);
  } catch {
    return results;
  }
  if (!rootStat.isDirectory()) return results;

  const stack = [rootDir];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.claude') continue;
      if (SKIP_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (extensions.includes(path.extname(entry.name))) {
        results.push(full);
      }
    }
  }
  return results;
}
