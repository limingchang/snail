/**
 * `wordCloud/` 的导出入口（barrel）。
 *
 * 之所以单独导出 `SWordTag`，一是它本身就有用（一个已定位、按景深缩放的标签），
 * 二是词云的公开契约就是用它来表达的；但除非使用方主动要求，插件不会把它注册为
 * 全局组件 —— 详见 `src/components.ts`。
 *
 * Barrel for `wordCloud/`.
 *
 * `SWordTag` is exported because it is genuinely useful on its own (a positioned,
 * depth-scaled label) and because the cloud's public contract is expressed in terms
 * of it, but it is not registered as a component by the plugin unless the consumer
 * asked for it — see `src/components.ts`.
 */
/** 旋转的三维词云组件。 / The rotating 3D word cloud component. */
export { default as SWordCloud } from "./WordCloud.vue";
/** 词云里的单个标签；可单独使用。 / One tag in the cloud; usable on its own. */
export { default as SWordTag } from "./WordTag.vue";
/** 全部公开类型。 / Every public type. */
export * from "./type";
// The sphere maths and colour model in `./model` are deliberately *not* re-exported
// here: they are the cloud's internals, and every one of them takes numbers rather
// than component data. They stay importable by path for anyone who needs them.
