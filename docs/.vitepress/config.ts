import { defineConfig } from "vitepress";

/**
 * VitePress 站点配置。
 *
 * 这里定义的每一条 `link` 都必须指向 `docs/` 下真实存在的文件：VitePress 在
 * 构建时会校验内部链接，死链会让 `docs:build` 直接失败。
 */
export default defineConfig({
  lang: "zh-CN",
  title: "@snail-js/api",
  description:
    "装饰器驱动、插件优先，只基于 axios 的 TypeScript HTTP 客户端：核心只拥有装饰器写入的元数据、请求管线与插件生命周期。",
  head: [
    ["meta", { name: "viewport", content: "width=device-width,initial-scale=1" }]
  ],

  themeConfig: {
    nav: [
      { text: "指南", link: "/guide/introduction", activeMatch: "/guide/" },
      { text: "API 参考", link: "/api/reference", activeMatch: "/api/" },
      { text: "示例", link: "/examples/crud", activeMatch: "/examples/" }
    ],

    sidebar: {
      "/guide/": [
        {
          text: "开始",
          items: [
            { text: "简介与设计原则", link: "/guide/introduction" },
            { text: "快速上手", link: "/guide/getting-started" },
            { text: "TypeScript 配置", link: "/guide/typescript" }
          ]
        },
        {
          text: "核心",
          items: [
            { text: "装饰器", link: "/guide/decorators" },
            { text: "参数装饰器", link: "/guide/parameters" },
            { text: "响应与类型", link: "/guide/responses" },
            { text: "错误处理", link: "/guide/errors" },
            { text: "方法事件", link: "/guide/events" },
            { text: "服务端配置", link: "/guide/configuration" },
            { text: "在服务端运行（Node / SSR）", link: "/guide/server-side" },
            { text: "框架适配器 Vue / React", link: "/guide/adapters" },
            { text: "SSE / WebSocket / HTTP 流", link: "/guide/streaming" }
          ]
        },
        {
          text: "插件",
          items: [
            { text: "使用插件", link: "/guide/plugins" },
            { text: "插件生命周期", link: "/guide/plugin-lifecycle" },
            { text: "插件生命周期（English）", link: "/guide/plugin-lifecycle_EN" },
            { text: "编写插件", link: "/guide/plugin-authoring" }
          ]
        },
        {
          text: "内置插件",
          items: [
            { text: "缓存 Cache", link: "/guide/plugin-cache" },
            { text: "请求池 RequestPool", link: "/guide/plugin-pool" },
            { text: "拦截器 Interceptor", link: "/guide/plugin-interceptor" },
            { text: "版本 Versioning", link: "/guide/plugin-versioning" },
            { text: "校验 Validate", link: "/guide/plugin-validate" },
            { text: "转换 Transform", link: "/guide/plugin-transform" }
          ]
        },
        {
          text: "请求策略",
          items: [
            { text: "策略概览", link: "/guide/strategies" },
            { text: "useRequest", link: "/guide/strategies/use-request" },
            { text: "useWatcher", link: "/guide/strategies/use-watcher" },
            { text: "useFetcher", link: "/guide/strategies/use-fetcher" },
            { text: "usePagination", link: "/guide/strategies/use-pagination" },
            { text: "useAutoRequest", link: "/guide/strategies/use-auto-request" },
            { text: "useRetriableRequest", link: "/guide/strategies/use-retriable-request" },
            { text: "useUploader", link: "/guide/strategies/use-uploader" },
            { text: "useTokenAuth", link: "/guide/strategies/use-token-auth" },
            { text: "useSSE", link: "/guide/strategies/use-sse" },
            { text: "useDownload", link: "/guide/strategies/use-download" }
          ]
        },
        {
          text: "其它",
          items: [
            { text: "本地化", link: "/guide/localization" },
            { text: "从 0.1.x 迁移", link: "/guide/migration" }
          ]
        }
      ],
      "/api/": [
        {
          text: "参考",
          items: [{ text: "API 参考", link: "/api/reference" }]
        }
      ],
      "/examples/": [
        {
          text: "示例",
          items: [
            { text: "Vue 3 完整示例", link: "/examples/vue" },
            { text: "CRUD 接口类", link: "/examples/crud" },
            { text: "文件上传与进度", link: "/examples/upload" }
          ]
        }
      ]
    },

    search: {
      provider: "local"
    },

    outline: "deep",
    editLink: false,

    socialLinks: [
      { icon: "github", link: "https://github.com/limingchang/snail" }
    ],

    docFooter: {
      prev: "上一页",
      next: "下一页"
    },

    footer: {
      message: "基于 MIT 许可发布",
      copyright: "Copyright © @snail-js"
    }
  }
});
