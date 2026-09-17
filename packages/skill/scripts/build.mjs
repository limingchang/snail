#!/usr/bin/env node
/**
 * Build for `@snail-js/skill`.
 *
 * Static content package, so "build" means: prove the content is valid, then
 * copy it somewhere a runtime can load it from without walking `src/`.
 *
 * 1. run the validator (`scripts/validate.mjs`) in-process — never spawn;
 * 2. copy `skills/` to `dist/skills/`;
 * 3. write `dist/manifest.json` describing every skill in the package.
 *
 * The manifest is what a consuming agent runtime reads first: it can list the
 * available skills without opening a single `SKILL.md`.
 */
import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PACKAGE_ROOT, renderReport, validateSkills } from "./validate.mjs";

const SKILLS_SRC = path.join(PACKAGE_ROOT, "skills");
const DIST = path.join(PACKAGE_ROOT, "dist");
const DIST_SKILLS = path.join(DIST, "skills");
const MANIFEST = path.join(DIST, "manifest.json");

/** Read `name`/`description` pairs out of the validated `SKILL.md` files. */
async function collectSkills() {
  const dirs = (await readdir(SKILLS_SRC, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  const skills = [];
  for (const dir of dirs) {
    const text = await readFile(path.join(SKILLS_SRC, dir, "SKILL.md"), "utf8");
    const lines = text.split(/\r?\n/);
    const end = lines.findIndex((line, index) => index > 0 && line.trim() === "---");

    const fields = {};
    for (let i = 1; i < end; i += 1) {
      const match = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(lines[i] ?? "");
      if (!match) continue;
      let value = match[2].trim();
      if (
        value.length >= 2 &&
        ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'")))
      ) {
        value = value.slice(1, -1);
      }
      fields[match[1]] = value;
    }

    skills.push({
      name: fields.name ?? dir,
      description: fields.description ?? "",
      path: `skills/${dir}`
    });
  }

  return skills;
}

const report = await validateSkills();
process.stdout.write(`${renderReport(report)}\n\n`);
if (!report.ok) {
  process.stderr.write("build aborted: the validator failed\n");
  process.exit(1);
}

const pkg = JSON.parse(await readFile(path.join(PACKAGE_ROOT, "package.json"), "utf8"));
const skills = await collectSkills();

await rm(DIST, { recursive: true, force: true });
await mkdir(DIST, { recursive: true });
await cp(SKILLS_SRC, DIST_SKILLS, { recursive: true });

const manifest = {
  name: pkg.name,
  version: pkg.version,
  skills
};

await writeFile(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

process.stdout.write(
  `built dist/${path.basename(MANIFEST)} — ${skills.length} skill(s): ${skills
    .map((skill) => skill.name)
    .join(", ")}\n`
);
