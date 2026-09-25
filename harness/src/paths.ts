import { fileURLToPath } from 'node:url';
import path from 'node:path';

/** The harness folder (harness/). */
export const HARNESS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/** The project root (the Calendar Heatmap repo). */
export const PROJECT_DIR = path.resolve(HARNESS_DIR, '..');
/** Where the render command writes its PNG and scene files. Ignored by git. */
export const OUT_DIR = path.join(HARNESS_DIR, 'out');

export const projectPath = (...parts: string[]) => path.join(PROJECT_DIR, ...parts);
export const harnessPath = (...parts: string[]) => path.join(HARNESS_DIR, ...parts);
