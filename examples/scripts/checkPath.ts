import { join, dirname } from "node:path";
import { fileURLToPath } from "url";
import chalk from "chalk";

const currentFileName = fileURLToPath(import.meta.url);
const currentDirName = dirname(dirname(currentFileName));
console.log(chalk.green("[Current Dir Name]", currentDirName));
function checkPathResolve() {
  // const pathStr = "@snail-js/core/iconFont/a.ts";
  const pathStr = "@snail-js/core";
  // const reg = new RegExp(/^@snail-js\/(\w+)\/(.*)/);
  const reg = new RegExp(/^@snail-js\/(\w+)/);
  const result = reg.test(pathStr);
  if (result) {
    const resPath = join(currentDirName, "../", "packages", RegExp.$1, "src",RegExp.$2);
    console.log(chalk.green("[Path Resolve]", resPath));
  }
}
checkPathResolve();
