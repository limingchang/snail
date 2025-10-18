import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  // 其他配置项...
  resolve: {
    alias: {
      '@/': resolve(__dirname, './src/')
    }
  }
  // 其他配置项...
})