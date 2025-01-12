// import { resolve } from "path";
import { defineConfig } from "vite";
import AutoImport from "unplugin-auto-import/vite";
import Components from "unplugin-vue-components/vite";
import { ElementPlusResolver } from "unplugin-vue-components/resolvers";
import vue from "@vitejs/plugin-vue";

import { join } from "node:path";

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    host: "0.0.0.0",
    port: 6001,
  },
  plugins: [
    vue(),
    AutoImport({
      resolvers: [ElementPlusResolver()],
    }),
    Components({
      resolvers: [ElementPlusResolver()],
    }),
  ],
  css: {
    preprocessorOptions: {
      scss: { api: "modern-compiler" },
    },
  },
  resolve: {
    alias: [
      {
        find: /^@snail-js\/(\w+)\/(.*)/,
        // replacement: join(__dirname, "..", "$1", "src"),
        replacement: join(
          __dirname,
          "../",
          "packages",
          "$1",
          "src",
          "$2"
        ),
      },
      {
        find: /^@snail-js\/(\w+)/,
        // replacement: join(__dirname, "..", "$1", "src"),
        replacement: join(__dirname, "../", "packages", "$1", "src"),
      },
    ],
    // alias:{
    //   "@snail-js/*": join(__dirname, "..", "packages/*")
    // }
  },
});
