/**
 * Static verification of the VitePress docs, mirroring what `docs:build` enforces:
 * dead internal links, dead anchors, sidebar links that point at nothing,
 * unbalanced code fences and `{{ }}` interpolation outside fences.
 *
 * It exists because a full `docs:build` needs esbuild to spawn a piped child
 * process, which confined sandboxes deny. This checker is the dependency-free
 * subset that always runs, and it is worth keeping in CI as a pre-flight: it fails
 * in well under a second instead of after a full VitePress build.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// `scripts/` sits directly under the docs root this checker walks.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const problems = [];
const files = [];

walk(root);
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".vitepress" || entry.name === "dist") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith(".md")) files.push(full);
  }
}

const { createMarkdownRenderer } = await import("vitepress");
const md = await createMarkdownRenderer(root, {});

// The site compiles each page's rendered HTML as a Vue template; do the same so
// malformed markup outside code spans is caught here rather than at build time.
let compile;
try {
  ({ compile } = await import("vue/compiler-dom"));
} catch {
  compile = undefined;
}

// ── anchors of every page, from the same renderer the site uses ────────────
const pageAnchors = new Map();
for (const file of files) {
  const html = md.render(fs.readFileSync(file, "utf8"));
  const ids = new Set([...html.matchAll(/<h[1-6][^>]*\sid="([^"]*)"/g)].map((m) => m[1]));
  pageAnchors.set(file, ids);
  if (compile) {
    try {
      compile(`<template>${html}</template>`, { onError: (error) => problems.push(`VUE TEMPLATE ${rel(file)} ${error.message}`) });
    } catch (error) {
      problems.push(`VUE TEMPLATE ${rel(file)} ${String(error)}`);
    }
  }
}

const rel = (p) => path.relative(root, p).replace(/\\/g, "/");

function resolveTarget(fromFile, link) {
  const noHash = link.split("#")[0].split("?")[0];
  if (noHash === "") return fromFile;
  if (noHash.startsWith("/")) return path.join(root, noHash);
  return path.resolve(path.dirname(fromFile), noHash);
}

/**
 * Candidate files for a resolved target, **most specific first**.
 *
 * Order matters, and getting it wrong is a silent false-negative: a route like
 * `/vue/` resolves to the *directory* `docs/vue`, which exists, so if the bare path
 * is tried first it always wins over `docs/vue/index.md`. Anchors are keyed on `.md`
 * files, so every anchor link into a directory route (`/vue/#组件总览`,
 * `/cli/#snail-generate`, `/editor/#快速上手`) was then reported dead even though the
 * headings exist. Declarations before the bare path fixes it, and the bare path stays
 * last only as a fallback for a target that genuinely is an unprefixed file.
 */
function candidateFiles(base) {
  const out = [`${base}.md`, path.join(base, "index.md"), `${base}.html`, base];
  if (base.endsWith(".html")) out.splice(2, 0, `${base.slice(0, -5)}.md`);
  return out;
}

/** `true` when `p` is an existing regular file, so a directory is never read. */
function isFile(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

for (const file of files) {
  const source = fs.readFileSync(file, "utf8");
  const html = md.render(source);

  // dead links
  for (const match of html.matchAll(/href="([^"]+)"/g)) {
    const href = match[1].replace(/&amp;/g, "&");
    if (/^(https?:)?\/\//.test(href) || href.startsWith("mailto:") || href.startsWith("#")) continue;
    const target = resolveTarget(file, href);
    const found = candidateFiles(target).find((candidate) => fs.existsSync(candidate));
    if (!found) {
      problems.push(`DEAD LINK  ${rel(file)} -> ${href}`);
      continue;
    }
    const hash = href.includes("#") ? decodeURIComponent(href.split("#")[1]) : "";
    if (hash) {
      const anchors =
        pageAnchors.get(found) ??
        (found.endsWith(".md") && isFile(found)
          ? new Set(
              [...md.render(fs.readFileSync(found, "utf8")).matchAll(/<h[1-6][^>]*\sid="([^"]*)"/g)].map(
                (m) => m[1]
              )
            )
          : new Set());
      if (!anchors.has(hash)) problems.push(`DEAD ANCHOR ${rel(file)} -> ${href}`);
    }
  }

  // H1
  if (!/^#\s+\S/m.test(source) && !source.startsWith("---")) problems.push(`NO H1      ${rel(file)}`);

  // fences + interpolation outside fences
  const lines = source.split(/\r?\n/);
  let fence = null;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const fenceMatch = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fenceMatch) {
      if (fence === null) fence = fenceMatch[1][0];
      else if (fenceMatch[1][0] === fence) fence = null;
      continue;
    }
    if (fence === null && /\{\{|\}\}/.test(line)) {
      problems.push(`MUSTACHE   ${rel(file)}:${i + 1} ${line.trim()}`);
    }
    // A generic like SnailStateRef<TData> left outside backticks becomes an HTML
    // tag to Vue's template compiler. Lines that *start* with `<` are deliberately
    // excluded: they are markup the page legitimately contains — `<script setup>`,
    // a `<DemoBlock …>` opening tag, `<IconBasic />` — not a generic that escaped
    // its backticks. Without this the demo pattern every component page uses
    // produces a warning per example, which drowns the real findings.
    if (fence === null) {
      const prose = line.replace(/`[^`]*`/g, "");
      if (
        /<\s*[A-Za-z][^>]*>$/.test(prose) &&
        !/^\s*</.test(prose) &&
        !/^\s*(import|export|\/\/)/.test(prose)
      ) {
        problems.push(`BARE TAG   ${rel(file)}:${i + 1} ${line.trim()}`);
      }
    }
  }
  if (fence !== null) problems.push(`UNCLOSED FENCE ${rel(file)}`);
}

// ── sidebar links ──────────────────────────────────────────────────────────
const config = fs.readFileSync(path.join(root, ".vitepress/config.ts"), "utf8");
const sidebarLinks = [...config.matchAll(/link:\s*"(\/[^"]*)"/g)].map((m) => m[1]);
for (const link of sidebarLinks) {
  // A sidebar entry may point at a section of a page (`/vue/#sicon`), which is the
  // normal shape for a single-page component reference. `path.join` would treat the
  // `#sicon` as part of the filename and report every such entry as a missing page,
  // so the anchor is stripped before resolving — the anchor itself is validated by
  // the in-page link pass above whenever a page links to it.
  const target = path.join(root, link.split("#")[0]);
  if (!candidateFiles(target).some((candidate) => fs.existsSync(candidate))) {
    problems.push(`SIDEBAR    ${link} -> no page`);
  }
}
// every page reachable from the sidebar (guide pages only)
const sidebarGuide = new Set(
  [...config.matchAll(/link:\s*"(\/guide\/[^"]*)"/g)].map((m) => m[1].replace(/^\//, ""))
);
for (const file of files.filter((f) => rel(f).startsWith("guide/"))) {
  const route = rel(file).replace(/\.md$/, "");
  if (!sidebarGuide.has(route)) problems.push(`NOT IN SIDEBAR ${route}`);
}

console.log(`checked ${files.length} pages, ${sidebarLinks.length} sidebar links`);
if (problems.length === 0) console.log("OK: no dead links, no dead anchors, no unbalanced fences");
else for (const problem of problems) console.log(problem);
process.exit(problems.length === 0 ? 0 : 1);
