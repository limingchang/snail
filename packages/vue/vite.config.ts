// packages/shared/vite.config.ts
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  build: {
    // 产物输出目录
    outDir: "dist",
    // 指定生成静态资源的存放路径,相对于outDir
    assetsDir: "assets",
    cssCodeSplit: true, // 启用/禁用 CSS 代码拆分
    // 参考：https://cn.vitejs.dev/config/build-options.html#build-lib
    lib: {
      // 构建的入口文件
      entry: "index.ts",

      // 产物的生成格式，默认为 ['es', 'umd']。我们使用默认值，注释掉此字段。
      // formats: ['es', 'umd'],

      // 当产物为 umd、iife 格式时，该模块暴露的全局变量名称
      name: "SnailVue",
      // 产物文件名称
      fileName: "snail-vue",
    },
    // 为了方便学习，查看构建产物，将此置为 false，不要混淆产物代码
    minify: false,
    // roll配置
    rollupOptions: {
      external: ["vue"],
      output: {
        globals: {
          vue: "Vue",
        },
      },
    },
  },
  plugins: [vue()],
  css: {
    preprocessorOptions: {
      scss: { api: "modern-compiler" },
    },
  },
});
