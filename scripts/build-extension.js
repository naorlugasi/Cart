#!/usr/bin/env node
/** Copies the shared injector into the extension folder (content scripts cannot import modules). */
import { copyFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(here, '..', 'src', 'handoff', 'injector.cjs');
const dest = path.join(here, '..', 'extension', 'injector.js');
copyFileSync(src, dest);
console.log(`copied ${path.relative(process.cwd(), src)} -> ${path.relative(process.cwd(), dest)}`);
