// import { join,dirname } from 'node:path';
// import { readdir, cp } from 'node:fs/promises';
// import { fileURLToPath } from "url";

// import chalk from 'chalk';

// const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
// console.log(rootDir);

// const SRC_DIR = 'src'
// const DIST_DIR = 'dist'

// async function match() {
//   const res = await readdir(join(rootDir,SRC_DIR), { withFileTypes: true });
//   return res.filter((item) => item.isDirectory()).map((item) => item.name);
// }

// async function resolve(dirname:string){
//   try{
//     const sourceDir = join(rootDir, SRC_DIR, dirname);
//     const targetDir = join(rootDir, DIST_DIR, dirname);
//     console.log(chalk.bold.hex('#fc7930')(`[${dirname}] moving\n`));
//     console.log(sourceDir,'=>',targetDir);
//     const sourceFiles = await readdir(sourceDir);
//     const cpTasks = sourceFiles.map((file) => {
//       const source = join(sourceDir, file);
//       const target = join(targetDir, file);
//       return cp(source, target, {
//         force: true,
//         recursive: true,
//       })
//     })
//     await Promise.all(cpTasks);
//     console.log(chalk.green(`[${dirname}]: moved successfully!`)); 
//   }catch(error){
//     console.log(error);
//     console.log(chalk.red(`[${dirname}]: failed to move!`));
//   }
// }


// async function main() {
//   const dirs = await match();
//   console.log('dirs:',dirs);
//   const tasks = dirs.map(resolve);
//   await Promise.all(tasks);
// }

// main().then(()=>{
//   console.log(chalk.green('复制样式完成.'));
// })

// import chalk from 'chalk';

// function main(){
//   console.log(chalk.bold.hex('#67C23A')('[生成图标数据]'))
// }

// function generateI

// main();