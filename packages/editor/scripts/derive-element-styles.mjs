/**
 * Derive the list of Element Plus stylesheets the editor needs.
 *
 * Element Plus's on-demand entry for a component (`es/components/<name>/style/css.mjs`) is what
 * states the component's own CSS *and its dependencies*, so the closure is computed from those files
 * rather than guessed. The editor imports the same set as raw `theme-chalk/el-*.css`, which is the
 * form a stylesheet can `@import` (and which the bundler cannot tree-shake away).
 *
 * Prints the `theme-chalk` files, sorted, plus the component names for the audit test.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const epRoot = join(
  process.cwd(),
  "node_modules/element-plus"
);
const componentsRoot = join(epRoot, "es/components");

/** The tags the editor's templates use, plus the two called programmatically. */
function usedComponents() {
  const sourceRoot = join(process.cwd(), "src");
  const found = new Set(["message", "config-provider", "icon"]);

  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".vue")) {
        const text = readFileSync(full, "utf8");
        const end = text.lastIndexOf("</template>");
        const template = end >= 0 ? text.slice(0, end) : "";
        for (const match of template.matchAll(/<(el-[a-z0-9-]+)/g)) {
          found.add(match[1].replace(/^el-/, ""));
        }
      }
    }
  };

  walk(sourceRoot);
  return [...found].sort();
}

const started = usedComponents();
const seen = new Set();
const themeChalk = new Set();
const queue = [...started];

while (queue.length > 0) {
  const name = queue.shift();
  if (seen.has(name)) continue;
  seen.add(name);

  const entry = join(componentsRoot, name, "style/css.mjs");
  if (!existsSync(entry)) {
    console.log(`# (no style entry for ${name})`);
    continue;
  }

  const body = readFileSync(entry, "utf8");
  // Side-effect imports: `import "../../base/style/css.mjs";` / `import "element-plus/theme-chalk/el-select.css";`
  for (const match of body.matchAll(/import\s+"([^"]+)"/g)) {
    const specifier = match[1];
    const relative = specifier.match(/\.\.\/\.\.\/([a-z0-9-]+)\/style\/css\.mjs$/);
    if (relative) {
      queue.push(relative[1]);
      continue;
    }
    const chunk = specifier.match(/theme-chalk\/(.+\.css)$/);
    if (chunk) themeChalk.add(chunk[1]);
  }
}

const files = [...themeChalk].sort();
console.log("// theme-chalk files needed:");
for (const file of files) console.log(`@import "element-plus/theme-chalk/${file}";`);
console.log("");
console.log("// component dirs:", [...seen].sort().join(", "));
console.log("// theme-chalk names:", files.map((f) => f.replace(/^el-|\.css$/g, "")).sort().join(", "));
