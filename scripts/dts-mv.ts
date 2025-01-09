import { join, dirname } from "node:path";
import { fileURLToPath } from "url";
import { readdir, cp } from "node:fs/promises";
import { existsSync } from "node:fs";

import chalk from "chalk";

const currentFileName = fileURLToPath(import.meta.url);
const root = dirname(currentFileName);
// console.log('root',root);
/** 以根目录为基础解析路径 */
const fromRoot = (...paths: string[]) => join(root, "..", ...paths);

/** 包的 d.ts 产物目录 */
const PKGS_DTS_DIR = fromRoot("packages/vue");

/** 包的目录 */
const PKGS_DIR = fromRoot("packages");

/** 单个包的 d.ts 产物相对目录 */
const PKG_DTS_RELATIVE_DIR = "dist";

/** 包的代码入口相对目录 */
const PKG_ENTRY_RELATIVE_DIR = "src";

/** 递归处理的包名 */
const RECRUSION_PKG_NAMES = ["vue"];

/** 记录 dts 移动的映射关系 */
let DTS_MAP: Array<{ source: string; target: string }> = [];

async function main() {
  const pkgs = await matchPkg();
  console.log(pkgs);
  const tasks = pkgs.map(resolve);
  // await Promise.all(tasks);
}

/** 寻找所有需要移动 dts 的包 */
async function matchPkg() {
  const res = await readdir(PKGS_DIR, { withFileTypes: true });

  return res.filter((item) => item.isDirectory()).map((item) => item.name);
}

async function moveDts(sourceDir: string, targetDir: string) {}

/**
 * 处理单个包的 dts 移动
 * @param pkgName 包名
 */
async function resolve(pkgName: string) {
  try {
    const indexDts = join(PKGS_DIR, pkgName, "index.d.ts");
    if (existsSync(indexDts)) {
      // const source = join(PKGS_DIR, pkgName, "index.d.ts");
      const target = join(
        PKGS_DIR,
        pkgName,
        PKG_DTS_RELATIVE_DIR,
        "index.d.ts"
      );
      DTS_MAP.push({
        source: indexDts,
        target,
      });
    }
    if (RECRUSION_PKG_NAMES.includes(pkgName)) {
      console.log(chalk.red(`递归处理[${pkgName}]`));
      // resolve(pkg);
      const sourceDir = join(PKGS_DIR, pkgName, PKG_ENTRY_RELATIVE_DIR);
      const sourceFiles = await readdir(sourceDir, { withFileTypes: true });
      // 处理src下的dts文件
      const dtsFiles = sourceFiles.filter(
        (file) => file.isFile() && file.name.endsWith(".d.ts")
      );
      dtsFiles.map((file) => {
        const source = join(sourceDir, file.name);
        const target = join(PKGS_DIR, pkgName, PKG_DTS_RELATIVE_DIR, file.name);
        // console.log(`[${pkgName}]: moving: ${source} => ${target}`);
        DTS_MAP.push({
          source,
          target,
        });
      });
      // 处理src下的文件夹
      const dirs = sourceFiles.filter((file) => file.isDirectory());
      console.log("----------------------");
      console.log(DTS_MAP);
      // console.log(dtsFiles);
      // await moveDts();
      // return;
    }
    // moveDts();
    // const sourceDir = join(PKGS_DTS_DIR, pkgName, PKG_ENTRY_RELATIVE_DIR);
    // const sourceDir = join(PKGS_DIR, pkgName, PKG_ENTRY_RELATIVE_DIR);
    // const targetDir = join(PKGS_DIR, pkgName, PKG_DTS_RELATIVE_DIR);
    // const sourceFiles = (await readdir(sourceDir)).filter((file) =>
    //   file.endsWith(".d.ts")
    // );
    // const sourceFiles = await readdir(sourceDir);
    // console.log(chalk.green(`处理[${sourceDir}]`));
    // console.log(sourceFiles);

    // const cpTasks = sourceFiles.map((file) => {
    //   const source = join(sourceDir, file);
    //   const target = join(targetDir, file);
    //   console.log(`[${pkgName}]: moving: ${source} => ${target}`);
    //   return cp(source, target, {
    //     force: true,
    //     recursive: true,
    //   });
    // });
    // await Promise.all(cpTasks);
    // console.log(`[${pkgName}]: moved successfully!`);
  } catch (e) {
    console.log(`[${pkgName}]: failed to move!`);
  }
}

main()
  .then(() => {
    // console.log("----------------------");
    // console.log(DTS_MAP);
    console.log(chalk.green("success!"));
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
