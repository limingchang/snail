import { defineConfig } from 'vitepress'

// https://vitepress.dev/reference/site-config
export default defineConfig({
  base:'/docs/',
  lang:'zh-Hans',
  title: "Snail 组件库",
  description: "小蜗牛组件库",
  outDir:'../dist/docs',
  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    nav: [
      { text: 'Snail', link: '/' },
      { text: '组件库', link: '/components' }
    ],

    sidebar: [
      {
        text: '组件库',
        items: [
          { text: '图标', link: '/vue/sicon' },
          { text: 'Runtime API Examples', link: '/api-examples' }
        ]
      }
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/vuejs/vitepress' }
    ]
  }
})
