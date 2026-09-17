# @snail-js/skill

给 AI 编码助手使用的 **agent skill**：教模型写出正确的 `@snail-js/api` 代码。

这个包是**纯静态内容包**，没有运行时代码、没有依赖。它唯一的产物是一份指令集（`SKILL.md`
加若干 `reference/` 页面），由 agent 运行时在模型动手写代码之前读入。

## 目录结构

```text
packages/skill/
  README.md                  # 本文件
  scripts/validate.mjs       # 校验器（无第三方依赖），同时是 test 脚本
  scripts/build.mjs          # 先校验，再把 skills/ 复制到 dist/ 并写出 manifest
  skills/snail-js-api/
    SKILL.md                 # 入口：五条硬规则 + 最小可运行示例 + 索引
    reference/               # 按主题展开的细节页（每页 ≤ 200 行，代码优先）
      decorators.md  parameters.md  responses.md  plugins.md
      strategies.md  plugin-authoring.md  streaming.md  troubleshooting.md
    assets/api-template.ts   # 可直接复制的骨架
```

`SKILL.md` 刻意保持简短（正文 200 行以内）：模型总是先读它，细节留给 `reference/`。每一条
内容都必须能改变模型的行为，或者纠正它本来会犯的错误——纯粹的介绍性文字一律删掉。

## 安装到 Claude Code

Claude Code 按约定读取 `skills/<name>/SKILL.md`。把整个 `skills/snail-js-api/` 目录复制过去：

```bash
# 个人级（所有项目可用）
cp -r node_modules/@snail-js/skill/skills/snail-js-api ~/.claude/skills/

# 项目级（跟随仓库，团队共享）
cp -r node_modules/@snail-js/skill/skills/snail-js-api .claude/skills/
```

在仓库内开发时，源目录是 [`./skills/snail-js-api/SKILL.md`](./skills/snail-js-api/SKILL.md)，
也可以直接用软链接指向它。

## 安装到其他 agent 运行时

`SKILL.md` 的 YAML frontmatter（`name` + `description`）就是路由信息：`description` 以
"Use proactively when…" 开头，逐条列出触发条件（文件名、符号、任务类型），运行时据此决定是否
加载这个技能。因此任何支持「按描述匹配技能」的运行时都可以直接消费本包：

1. 读取 [`./skills/snail-js-api/SKILL.md`](./skills/snail-js-api/SKILL.md) 的 frontmatter 做匹配；
2. 命中后加载 `SKILL.md` 正文；
3. 正文里的相对链接指向 `reference/`，按需继续加载。

构建产物 `dist/manifest.json` 就是为这一步准备的——运行时无需打开任何 `SKILL.md` 即可列出
本包的全部技能：

```json
{
  "name": "@snail-js/skill",
  "version": "1.0.0",
  "skills": [
    {
      "name": "snail-js-api",
      "description": "Use proactively when …",
      "path": "skills/snail-js-api"
    }
  ]
}
```

## 校验与构建

```bash
pnpm --dir packages/skill test     # = node ./scripts/validate.mjs，只读校验
pnpm --dir packages/skill build    # 先校验，失败即中止；然后输出 dist/
```

> Windows 沙箱环境下请使用 `pnpm.CMD`（`.ps1` shim 在该环境中不可用）。

`build` 绝不跳过校验：任何一条规则失败都会以非零退出码结束，并打印可读的问题清单。构建产物：

```text
dist/skills/**        # skills/ 的完整副本
dist/manifest.json    # { name, version, skills: [{ name, description, path }] }
```

## 校验规则

`scripts/validate.mjs` 零依赖实现，逐条对应一种真实的失败模式：

| 规则 | 拦截的问题 |
| --- | --- |
| frontmatter | `name` 必须是小写 kebab-case 且 ≤ 64 字符；`description` ≤ 1024 字符并以 "Use when" / "Use proactively when" 开头 |
| directory | 目录名必须等于 frontmatter 的 `name`（运行时按 `skills/<name>/SKILL.md` 加载） |
| body-budget | `SKILL.md` 正文超过 200 行告警，超过 300 行失败 |
| fences | 每个 Markdown 代码围栏都必须闭合且带语言标记，否则整页内容会被静默吞掉 |
| links | 每个相对 Markdown 链接都必须指向真实存在的文件 |
| mentions | `reference/`、`assets/` 下的每个文件都必须在 `SKILL.md` 里被引用（否则就是没人会读的死页） |
| forbidden-reflect-metadata | 任何文件都不允许推荐安装元数据 polyfill（该库基于装饰器自身写入的元数据，不需要额外依赖） |
| forbidden-baseurl | tsconfig 形态的围栏里不允许出现 `baseUrl`（TypeScript 7 已移除该选项） |

运行时输出每个文件的检查数量与每条规则的通过情况，便于在 CI 中直接定位问题。

## 内容与 `@snail-js/api` 的关系

- 插件生命周期以文档站的[插件生命周期](https://snail-js.github.io/api/guide/plugin-lifecycle)页为唯一权威来源
  （英文原文为 [Plugin lifecycle](https://snail-js.github.io/api/guide/plugin-lifecycle_EN)），
  `plugin-authoring.md` 是它的实用版。
- 装饰器、参数、响应、流式装饰器的说明均对照 `packages/api/src/**` 源码写成；默认值取
  `src/default/options.ts`，`exports` 子路径取 `packages/api/package.json`。
- 内置插件与请求策略**已冻结并全部通过测试**，`plugins.md` 与 `strategies.md` 直接记录真实的
  工厂名、选项字段与默认值、装饰器与 hook 签名。记这些内容时必须对照源码与测试，不得凭印象
  杜撰。
- 框架适配器**不在** `@snail-js/api/plugins` 里（该 barrel 一旦 re-export 就会静态引入 `vue`
  与 `react`）。正确路径是 `@snail-js/api/plugins/vue` 与 `@snail-js/api/plugins/react`；
  `plugins.md`、`troubleshooting.md` 都把这条写成显式的陷阱。

## License

MIT
