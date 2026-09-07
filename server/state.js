import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import path from 'node:path';

/**
 * Tiny JSON persistence for runtime state (carts, lists, handoffs, alerts).
 * Writes are debounced and atomic (write temp file, then rename).
 */
export class StateFile {
  constructor(filePath, { debounceMs = 300 } = {}) {
    this.filePath = filePath;
    this.debounceMs = debounceMs;
    this.timer = null;
    this.getSnapshot = null;
  }

  load() {
    if (!this.filePath || !existsSync(this.filePath)) return null;
    try {
      return JSON.parse(readFileSync(this.filePath, 'utf8'));
    } catch (err) {
      console.warn(`[state] could not read ${this.filePath}: ${err.message}`);
      return null;
    }
  }

  bind(getSnapshot) {
    this.getSnapshot = getSnapshot;
  }

  schedule() {
    if (!this.filePath || !this.getSnapshot) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), this.debounceMs);
    this.timer.unref?.();
  }

  flush() {
    clearTimeout(this.timer);
    this.timer = null;
    if (!this.filePath || !this.getSnapshot) return;
    try {
      mkdirSync(path.dirname(this.filePath), { recursive: true });
      const tmp = `${this.filePath}.tmp`;
      writeFileSync(tmp, JSON.stringify(this.getSnapshot()));
      renameSync(tmp, this.filePath);
    } catch (err) {
      console.warn(`[state] could not write ${this.filePath}: ${err.message}`);
    }
  }
}
