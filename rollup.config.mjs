import resolve from "@rollup/plugin-node-resolve";
import vuePlugin from "rollup-plugin-vue";
import scss from "rollup-plugin-scss";

/** @type {impoort("rollup").RollOptions} */
export default {
  input: "./packages/vue/index.ts",
  output: [
    {
      file: "dist/es.js",
      name: "SnailUI",
      format: "es",
    },
    {
      file: "dist/cjs.js",
      name: "SnailUI",
      format: "cjs",
    },
    {
      file: "dist/umd.js",
      name: "SnailUI",
      format: "umd",
    },
  ],
  plugins: [resolve(), vuePlugin(), scss({
    output: "dist/index.css",
  })],
  external: ["vue"], // 依赖模块
};
