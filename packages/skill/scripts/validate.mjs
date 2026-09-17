#!/usr/bin/env node
/**
 * Static validator for the `@snail-js/skill` package.
 *
 * The package ships instructions for another model, so the failure mode it must
 * catch is a *misleading* instruction — a plausible-looking `@snail-js/api`
 * program that cannot work. Every rule below exists to keep a specific wrong
 * belief out of the skill:
 *
 * | Rule | Why |
 * | --- | --- |
 * | frontmatter | a router matches on `name` + `description`; a malformed header makes the skill undiscoverable |
 * | directory | the runtime loads `skills/<name>/SKILL.md`, so the folder must equal the declared name |
 * | body budget | the entry point must stay short; detail belongs in `reference/` |
 * | fences | an unterminated or unlabelled fence silently swallows the rest of a page |
 * | links | a dead `reference/*.md` link is a page the model will never open |
 * | mentions | an orphaned reference page is dead weight nobody reads |
 * | reflect-metadata | the library never reads design-time metadata; telling a user to install it is wrong |
 * | baseUrl | TypeScript 7 removed it, so a generated tsconfig containing it does not compile |
 *
 * Dependency-free on purpose: `node ./scripts/validate.mjs` is the package's
 * `test` script, so there must be nothing to install first.
 *
 * `validateSkills()` is exported so `scripts/build.mjs` can reuse the same
 * checks in-process instead of spawning a child process.
 */
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** Absolute path of the `@snail-js/skill` package. */
export const PACKAGE_ROOT = path.resolve(HERE, "..");

const SKILLS_ROOT = path.join(PACKAGE_ROOT, "skills");
const README_FILE = path.join(PACKAGE_ROOT, "README.md");

/** Kebab-case, lower case only. */
const NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const NAME_MAX = 64;
const DESCRIPTION_MAX = 1024;
const BODY_WARN = 200;
const BODY_FAIL = 300;

/** A `reflect-metadata` line is only allowed when it also says one of these. */
const NEGATIONS = ["not", "no", "never", "不需要", "没有", "do not", "don't", "removed"];

/** Link targets that are not files in this package. */
const NON_FILE_LINK = /^(?:[a-z][a-z0-9+.-]*:|\/|#)/i;

const RULE_DEFS = [
  ["frontmatter", "SKILL.md frontmatter: kebab-case name, trigger description"],
  ["directory", "skill directory name equals the frontmatter name"],
  ["body-budget", `SKILL.md body line budget (warn > ${BODY_WARN}, fail > ${BODY_FAIL})`],
  ["fences", "every ``` fence is closed and carries a language tag"],
  ["links", "every relative markdown link resolves to a file"],
  ["mentions", "every reference/ and assets/ file is linked from SKILL.md"],
  ["forbidden-reflect-metadata", "no un-negated `reflect-metadata` instruction"],
  ["forbidden-baseurl", "no `baseUrl` inside a tsconfig-looking fence"]
];

// ── helpers ─────────────────────────────────────────────────────────────────

/** Package-relative, POSIX-separated label used in every message. */
function rel(absolute) {
  return path.relative(PACKAGE_ROOT, absolute).split(path.sep).join("/");
}

/** Every file below `dir`, recursively. */
async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(full)));
    else if (entry.isFile()) files.push(full);
  }
  return files;
}

/**
 * Split a markdown file into frontmatter data and the body.
 *
 * Deliberately minimal: the frontmatter of a skill is a flat `key: value` map,
 * which is all a router reads. It is not a general YAML parser.
 */
function parseFrontmatter(text) {
  const lines = text.split(/\r?\n/);
  if ((lines[0] ?? "").trim() !== "---") {
    return { error: "does not start with a `---` frontmatter fence" };
  }

  const end = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  if (end === -1) return { error: "frontmatter is not closed by a `---` line" };

  const data = {};
  for (let i = 1; i < end; i += 1) {
    const line = lines[i];
    if (line.trim().length === 0 || line.trimStart().startsWith("#")) continue;

    const match = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line);
    if (!match) return { error: `frontmatter line ${i + 1} is not a \`key: value\` pair` };

    let value = match[2].trim();
    const quoted =
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"));
    if (quoted && value.length >= 2) value = value.slice(1, -1);
    data[match[1]] = value;
  }

  return { data, body: lines.slice(end + 1).join("\n"), bodyStartLine: end + 2 };
}

/**
 * Split markdown into code fences and the lines outside them.
 *
 * Returns `unclosed` when a fence is never terminated, so the caller can point
 * at the exact line that made the rest of the page disappear.
 */
function scanFences(text) {
  const lines = text.split(/\r?\n/);
  const fences = [];
  const outside = [];
  let current = null;

  lines.forEach((line, index) => {
    const match = /^\s*```(.*)$/.exec(line);
    if (match) {
      if (current) {
        current.end = index + 1;
        fences.push(current);
        current = null;
      } else {
        current = { lang: match[1].trim(), start: index + 1, content: [] };
      }
      return;
    }

    if (current) current.content.push(line);
    else outside.push(line);
  });

  return { fences, outside, unclosed: current };
}

/** Relative markdown link targets on one line, with code spans removed. */
function linkTargets(line) {
  const stripped = line.replace(/`[^`]*`/g, "");
  const targets = [];
  const pattern = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  let match;
  while ((match = pattern.exec(stripped)) !== null) targets.push(match[1]);
  return targets;
}

// ── the validator ───────────────────────────────────────────────────────────

/**
 * Run every rule.
 *
 * @returns {Promise<{ok: boolean, filesChecked: number, skills: string[], rules: Array<{id: string, title: string, checks: number, failures: string[]}>, warnings: string[]}>}
 */
export async function validateSkills() {
  const rules = RULE_DEFS.map(([id, title]) => ({ id, title, checks: 0, failures: [] }));
  const byId = new Map(rules.map((rule) => [rule.id, rule]));
  const warnings = [];
  const fail = (id, message) => byId.get(id).failures.push(message);
  const bump = (id, amount = 1) => {
    byId.get(id).checks += amount;
  };

  const scanned = [];
  const markdown = [];
  const skills = [];

  // Scope of the forbidden-string rules: everything this package ships as
  // instructions (`skills/**` and `README.md`). `scripts/` is excluded on
  // purpose — the rules themselves are written in terms of those strings.

  if (!existsSync(SKILLS_ROOT)) {
    fail("frontmatter", "skills/ directory is missing");
  } else {
    const dirs = (await readdir(SKILLS_ROOT, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    if (dirs.length === 0) fail("frontmatter", "skills/ contains no skill directory");

    for (const dirName of dirs) {
      const skillRoot = path.join(SKILLS_ROOT, dirName);
      const skillFile = path.join(skillRoot, "SKILL.md");

      bump("frontmatter");
      if (!existsSync(skillFile)) {
        fail("frontmatter", `skills/${dirName}/SKILL.md is missing`);
        continue;
      }

      const text = await readFile(skillFile, "utf8");
      skills.push(dirName);

      const parsed = parseFrontmatter(text);
      if (parsed.error) {
        fail("frontmatter", `${rel(skillFile)} ${parsed.error}`);
      } else {
        const { name = "", description = "" } = parsed.data;

        if (name.length === 0) fail("frontmatter", `${rel(skillFile)} frontmatter has no \`name\``);
        if (name.length > NAME_MAX) {
          fail("frontmatter", `${rel(skillFile)} name is ${name.length} chars (max ${NAME_MAX})`);
        }
        if (name.length > 0 && !NAME_PATTERN.test(name)) {
          fail("frontmatter", `${rel(skillFile)} name "${name}" is not kebab-case`);
        }

        if (description.length === 0) {
          fail("frontmatter", `${rel(skillFile)} frontmatter has no \`description\``);
        }
        if (description.length > DESCRIPTION_MAX) {
          fail(
            "frontmatter",
            `${rel(skillFile)} description is ${description.length} chars (max ${DESCRIPTION_MAX})`
          );
        }
        if (
          description.length > 0 &&
          !description.startsWith("Use when") &&
          !description.startsWith("Use proactively when")
        ) {
          fail(
            "frontmatter",
            `${rel(skillFile)} description must start with "Use when" or "Use proactively when"`
          );
        }

        bump("directory");
        if (name.length > 0 && name !== dirName) {
          fail("directory", `${rel(skillFile)} declares name "${name}" but lives in skills/${dirName}`);
        }

        const bodyLines = parsed.body.split("\n").length;
        bump("body-budget");
        if (bodyLines > BODY_FAIL) {
          fail("body-budget", `${rel(skillFile)} body is ${bodyLines} lines (fail above ${BODY_FAIL})`);
        } else if (bodyLines > BODY_WARN) {
          warnings.push(`${rel(skillFile)} body is ${bodyLines} lines (warn above ${BODY_WARN})`);
        }

        const files = await walk(skillRoot);
        for (const file of files) {
          const relative = path.relative(skillRoot, file).split(path.sep).join("/");
          if (!/^(reference|assets)\//.test(relative)) continue;
          bump("mentions");
          if (!text.includes(relative)) {
            fail("mentions", `${rel(skillFile)} never links ${relative}`);
          }
        }
      }

      for (const file of await walk(skillRoot)) {
        scanned.push(file);
        if (file.toLowerCase().endsWith(".md")) markdown.push(file);
      }
    }
  }

  if (existsSync(README_FILE)) {
    scanned.push(README_FILE);
    markdown.push(README_FILE);
  }

  // ── fences + tsconfig-looking fences ───────────────────────────────────────
  for (const file of markdown) {
    const text = await readFile(file, "utf8");
    const { fences, unclosed } = scanFences(text);

    if (unclosed) {
      fail("fences", `${rel(file)}:${unclosed.start} opens a \`\`\` fence that is never closed`);
    }

    for (const fence of fences) {
      bump("fences");
      if (fence.lang.length === 0) {
        fail("fences", `${rel(file)}:${fence.start} has no language tag`);
      }
    }

    for (const fence of fences) {
      const content = fence.content.join("\n");
      if (!/"compilerOptions"/.test(content)) continue;
      bump("forbidden-baseurl");
      if (/baseUrl/.test(content)) {
        fail(
          "forbidden-baseurl",
          `${rel(file)}:${fence.start} contains \`baseUrl\` in a tsconfig; TypeScript 7 removed it`
        );
      }
    }
  }

  // ── links ─────────────────────────────────────────────────────────────────
  for (const file of markdown) {
    const text = await readFile(file, "utf8");
    const { outside } = scanFences(text);

    outside.forEach((line, index) => {
      for (const target of linkTargets(line)) {
        if (target.length === 0 || NON_FILE_LINK.test(target)) continue;
        bump("links");

        const bare = target.split("#")[0].split("?")[0];
        if (bare.length === 0) continue;

        const resolved = path.resolve(path.dirname(file), bare);
        if (!existsSync(resolved)) {
          fail("links", `${rel(file)}:${index + 1} → ${target} does not exist`);
        }
      }
    });
  }

  // ── forbidden strings ─────────────────────────────────────────────────────
  for (const file of scanned) {
    const text = await readFile(file, "utf8");

    text.split(/\r?\n/).forEach((line, index) => {
      if (!/reflect-metadata/i.test(line)) return;
      bump("forbidden-reflect-metadata");

      const lower = line.toLowerCase();
      if (!NEGATIONS.some((word) => lower.includes(word))) {
        fail(
          "forbidden-reflect-metadata",
          `${rel(file)}:${index + 1} mentions \`reflect-metadata\` without negating it`
        );
      }
    });
  }

  return {
    ok: rules.every((rule) => rule.failures.length === 0),
    filesChecked: scanned.length,
    skills,
    rules,
    warnings
  };
}

/** Human-readable report for the terminal. */
export function renderReport(report) {
  const lines = [];
  lines.push("@snail-js/skill — validating agent skill content");
  lines.push(`  files checked: ${report.filesChecked}`);
  lines.push(`  skills: ${report.skills.length > 0 ? report.skills.join(", ") : "(none)"}`);
  lines.push("");

  for (const rule of report.rules) {
    const mark = rule.failures.length === 0 ? "PASS" : "FAIL";
    lines.push(`[${mark}] ${rule.id} — ${rule.title} (${rule.checks} checked)`);
    for (const failure of rule.failures) lines.push(`        - ${failure}`);
  }

  for (const warning of report.warnings) lines.push(`[WARN] ${warning}`);

  const passed = report.rules.filter((rule) => rule.failures.length === 0).length;
  lines.push("");
  lines.push(`${passed}/${report.rules.length} rules passed`);
  lines.push(report.ok ? "OK — skill content is valid" : "FAILED — fix the problems above");
  return lines.join("\n");
}

const invokedDirectly =
  typeof process.argv[1] === "string" &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (invokedDirectly) {
  const report = await validateSkills();
  process.stdout.write(`${renderReport(report)}\n`);
  process.exit(report.ok ? 0 : 1);
}
