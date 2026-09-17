/**
 * Filesystem helpers.
 *
 * ## Why this is not `fs` calls sprinkled through the pipeline
 *
 * Two rules have to hold for every write, and both are easy to forget at a call
 * site:
 *
 * 1. **The output directory may not exist.** `--out src/apis` on a fresh project
 *    must create it, including parents.
 * 2. **`--clean` may only delete our own files.** The output directory routinely
 *    contains hand-written siblings (`src/apis/manual.api.ts`); deleting the
 *    directory would destroy them. Deletion is therefore gated on the generated
 *    header marker, which is passed in rather than hard-coded so this module stays
 *    ignorant of the emitter's format.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { dirname, join, relative, sep } from "node:path";

/** Recursively create `directory`. A no-op when it already exists. */
export function ensureDirectory(directory: string): void {
  mkdirSync(directory, { recursive: true });
}

/**
 * Write `contents` to `filePath`, creating the parent directory first.
 *
 * Overwrites unconditionally: the overwrite *decision* belongs to the caller,
 * which knows whether `--force` was passed; a helper that silently refuses would
 * only move the message further from the user.
 */
export function writeTextFile(filePath: string, contents: string): void {
  ensureDirectory(dirname(filePath));
  writeFileSync(filePath, contents, "utf8");
}

/** Read a file as UTF-8 text; throws with the OS message when it cannot be read. */
export function readTextFile(filePath: string): string {
  return readFileSync(filePath, "utf8");
}

/** `true` when anything (file or directory) exists at `target`. */
export function pathExists(target: string): boolean {
  return existsSync(target);
}

/** `true` when `target` exists *and* is a directory; a file is not an output root. */
export function isDirectory(target: string): boolean {
  return existsSync(target) && statSync(target).isDirectory();
}

/**
 * Every file below `directory`, as absolute paths in a stable order.
 *
 * Sorted so that `--clean` and `--dry-run` report the same order on every run;
 * `readdirSync` makes no ordering promise.
 */
export function listFiles(directory: string): string[] {
  if (!isDirectory(directory)) return [];

  const found: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) {
      found.push(...listFiles(full));
    } else if (entry.isFile()) {
      found.push(full);
    }
  }

  return found.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * `true` when the file starts with the generated marker.
 *
 * Read as a small prefix rather than the whole file: output files can be large and
 * `--clean` only needs the first line.
 */
export function hasGeneratedMarker(filePath: string, marker: string): boolean {
  try {
    return readFileSync(filePath, "utf8").startsWith(marker);
  } catch {
    // Unreadable files are not ours to delete; treating them as user files is the
    // safe direction.
    return false;
  }
}

/**
 * Delete every generated file below `directory`.
 *
 * Returns the deleted paths. Directories are removed only once empty, so a
 * sub-directory that also holds user files survives. A missing directory is not an
 * error — `--clean --dry-run` on a fresh project is a legitimate command.
 */
export function removeGeneratedFiles(directory: string, marker: string): string[] {
  if (!isDirectory(directory)) return [];

  const removed: string[] = [];

  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        try {
          // `rmdir` semantics: fails when the directory is not empty, which is the
          // behaviour we want.
          rmSync(full, { recursive: false });
        } catch {
          /* still holds user files — keep it */
        }
        continue;
      }

      if (!entry.isFile() || !hasGeneratedMarker(full, marker)) continue;
      rmSync(full, { force: true });
      removed.push(full);
    }
  };

  walk(directory);
  return removed.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/** Path separators normalised to `/`, so generated imports are portable. */
export function toPosixPath(value: string): string {
  return value.split(sep).join("/");
}

/** `to` expressed relative to `from`, with `/` separators. */
export function relativePosixPath(from: string, to: string): string {
  return toPosixPath(relative(from, to));
}
