import { join, dirname } from "node:path";
import { readdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "url";

import chalk from "chalk";
const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));

const ICONS_FOLDER = "svgIcons";
// console.log(join(rootDir,ICONS_FOLDER));

async function match() {
  const files = await readdir(join(rootDir, ICONS_FOLDER), {
    withFileTypes: true,
  });
  return files
    .filter((item) => item.isFile() && item.name.endsWith(".vue"))
    .map((item) => item.name);
}


async function generateIndex() {
  const files = await match();
  console.log(chalk.bold.hex("#67C23A")(`找到${files.length}个图标组件`));
  const iconsImport = files.map((file) => {
    const name = file.replace(".vue", "");
    return `import ${name} from "./${file}";`;
  });
  const installFunc = `
function install(component:Component){
  (component as any).install = (app:App) => {
    app.component(component.name, component);
  };
  return component;
}`
  const iconsExport = files.map((file) => {
    const name = file.replace(".vue", "");
    return `export const Icon${name} = install(${name});`;
  });
  const indexStr = `import type { Component, App } from "vue";\n\n${iconsImport.join("\n")}\n\n${installFunc}\n\n${iconsExport.join("\n")}`;
  await writeFile(join(rootDir, ICONS_FOLDER, "index.ts"), indexStr);
}

async function main() {
  try {
    await generateIndex();
    console.log(chalk.green("生成图标导出[index.ts]完成."));
  } catch (error) {
    console.log(error);
  }
}

await main();