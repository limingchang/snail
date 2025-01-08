import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import * as Icons from "@element-plus/icons-vue";

const currentFileName = fileURLToPath(import.meta.url);
const currentDirName = dirname(currentFileName);

const getIconFontName = () => {
  const jsonFile = "./iconfont.json";
  const path = join(currentDirName, jsonFile);
  const data = readFileSync(path, "utf-8");
  const jsonData = JSON.parse(data);
  const prefix = jsonData.css_prefix_text;
  let iconNamesStr = "";
  jsonData.glyphs.map(
    (item) => iconNamesStr += `  '${prefix}${item.font_class}',\n`
  );
  
  const ElIconNames = Object.keys(Icons);
  let ElIconNamesStr = "";
  ElIconNames.map(
    (item) => ElIconNamesStr += `  '${item}',\n`
  );
  const writeData = `export const IconNames = [\n${iconNamesStr}] as const;\nexport const ElIconNames = [\n${ElIconNamesStr}] as const;\nexport type TIconNames = typeof IconNames[number] | typeof ElIconNames[number];\n
  `;
  const writePath = join(currentDirName, "iconNames.ts");
  writeFileSync(writePath, writeData);
};

getIconFontName();
