import { defineConfig } from 'vite'
// import vue from '@vitejs/plugin-vue'

export default defineConfig({
  css: {
    preprocessorOptions: {
      scss: { api: "modern-compiler" },
    },
  },
})