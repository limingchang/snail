// import { resolve } from "path";
import { defineConfig } from "vite";
import AutoImport from "unplugin-auto-import/vite";
import Components from "unplugin-vue-components/vite";
import { ElementPlusResolver } from "unplugin-vue-components/resolvers";
import vue from "@vitejs/plugin-vue";

import { join, resolve } from "node:path";

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    host: "0.0.0.0",
    port: 6001,
    // proxy: {
    //   "/api": {
    //     target: "http://shanhe.kim",
    //     changeOrigin: true,
    //   },
    // },
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
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
  resolve: {
    // alias: [
    //   {
    //     find: /^@snail-js\/vue\/index.css/,
    //     // replacement: join(__dirname, "..", "$1", "src"),
    //     replacement: join(__dirname, "../", "packages/vue/src/theme/index.scss"),
    //   },
    //   {
    //     find: /^@snail-js\/(\w+)\/(.*)/,
    //     // replacement: join(__dirname, "..", "$1", "src"),
    //     replacement: join(__dirname, "../", "packages", "$1", "src", "$2"),
    //   },
    //   {
    //     find: /^@snail-js\/(\w+)/,
    //     // replacement: join(__dirname, "..", "$1", "src"),
    //     replacement: join(__dirname, "../", "packages", "$1", "src"),
    //   },
    //   {
    //     find: /^@\/(.*)/,
    //     replacement: join(__dirname, "./src/$1"),
    //   }
    // ],
    // alias:{
    //   "@snail-js/*": join(__dirname, "..", "packages/*")
    // }
    alias: {
      '@/': resolve(__dirname, './src/'),
      '@snail-js/': resolve(__dirname, '../packages/'),
    }
  },
});
