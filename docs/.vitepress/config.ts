import { defineConfig } from "vitepress";

/**
 * VitePress 站点配置。
 *
 * 这里定义的每一条 `link` 都必须指向 `docs/` 下真实存在的文件：VitePress 在
 * 构建时会校验内部链接，死链会让 `docs:build` 直接失败。
 */
export default defineConfig({
  // The site is served from `https://limingchang.github.io/snail/`, so VitePress
  // needs the base to generate correct asset and internal-link URLs. Without it a
  // deployment under a repository sub-path loads a blank page.
  base: "/snail/",
  lang: "zh-CN",
  title: "@snail-js",
  description:
    "装饰器驱动的 HTTP 客户端、OpenAPI 代码生成器、合同模板编辑器与 Vue 组件库 —— 只依赖 axios，一切皆插件。",
  head: [
    ["meta", { name: "viewport", content: "width=device-width,initial-scale=1" }]
  ],

  themeConfig: {
    nav: [
      { text: "指南", link: "/guide/introduction", activeMatch: "/guide/" },
      { text: "@snail-js/api", link: "/api/reference", activeMatch: "/api/" },
      { text: "@snail-js/editor", link: "/editor/", activeMatch: "/editor/" },
      { text: "@snail-js/vue", link: "/vue/", activeMatch: "/vue/" },
      { text: "@snail-js/cli", link: "/cli/", activeMatch: "/cli/" },
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
      ],
      // The three package guides. `editor` and `vue` are single pages that hold
      // every component, so their sidebars link into the page's own sections —
      // which is what makes a component reference usable without a page per
      // component. `check-links.mjs` strips the anchor before resolving the file.
      "/editor/": [
        {
          text: "@snail-js/editor",
          items: [
            { text: "总览", link: "/editor/" },
            { text: "快速上手", link: "/editor/#快速上手" },
            { text: "两种模式", link: "/editor/#两种模式" },
            { text: "模板来源与保存", link: "/editor/#模板的来源与保存" }
          ]
        },
        {
          text: "扩展",
          items: [
            { text: "变量", link: "/editor/#变量" },
            { text: "页眉页脚与页码", link: "/editor/#页眉页脚与页码" },
            { text: "水印", link: "/editor/#水印" },
            { text: "打印", link: "/editor/#打印" },
            { text: "全部扩展", link: "/editor/#扩展" }
          ]
        },
        {
          text: "接口",
          items: [
            { text: "组件接口", link: "/editor/#组件接口" },
            { text: "已知的清晰边界", link: "/editor/#已知的清晰边界" },
            { text: "与 0.1.x 的差异", link: "/editor/#与-0-1-x-的差异" }
          ]
        }
      ],
      "/vue/": [
        {
          text: "@snail-js/vue",
          items: [
            { text: "总览", link: "/vue/" },
            { text: "安装", link: "/vue/#安装" },
            { text: "组件总览", link: "/vue/#组件总览" }
          ]
        },
        {
          text: "组件",
          items: [
            { text: "SIcon", link: "/vue/#sicon" },
            { text: "图标集", link: "/vue/#图标集" },
            { text: "SClickCopy", link: "/vue/#sclickcopy" },
            { text: "AliCaptcha", link: "/vue/#alicaptcha" },
            { text: "SPopUpMenu", link: "/vue/#spopupmenu" },
            { text: "SWordCloud", link: "/vue/#swordcloud" }
          ]
        },
        {
          text: "主题",
          items: [
            { text: "设计令牌", link: "/vue/#主题" },
            { text: "与 0.1.x 的差异", link: "/vue/#与-0-1-x-的差异" }
          ]
        }
      ],
      "/cli/": [
        {
          text: "@snail-js/cli",
          items: [
            { text: "总览", link: "/cli/" },
            { text: "安装", link: "/cli/#安装" },
            { text: "snail init", link: "/cli/#snail-init" },
            { text: "snail generate", link: "/cli/#snail-generate" },
            { text: "生成的文件结构", link: "/cli/#生成的文件结构" },
            { text: "确定性保证", link: "/cli/#确定性保证" },
            { text: "程序化 API", link: "/cli/#程序化-api" },
            { text: "已知限制", link: "/cli/#已知限制" }
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
