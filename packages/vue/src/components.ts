/**
 * 插件安装的静态组件表。
 *
 * ## 为什么用字面量而不是命名空间导入
 *
 * 旧版的 `components.ts` 对每个目录做 `export * from …`，插件则 `import * as components`
 * 再 `Object.entries(components)`。命名空间对象对打包器是不透明的：只要读取其中一个成员，
 * 所有成员都必须被保留，这正是旧包无法从入口摇掉任何一个图标的原因。
 *
 * 静态对象字面量则给出打包器可以看穿的形状：只 `import { SClickCopy }`（从不使用默认导出
 * 的插件）的应用可以丢掉本文件里的其他一切，因为 `package.json` 的 `sideEffects` 已把包的
 * 副作用限制在样式表上。
 *
 * 注册整套图标组件，正是 `<SIcon icon="IconVariable" />` 用**字符串**就能工作的原因：
 * `SIcon` 会通过 Vue 的组件注册表解析字符串。
 *
 * The static component map the plugin installs.
 *
 * ## Why a literal and not a namespace import
 *
 * The legacy `components.ts` was `export * from …` for each folder and the plugin did
 * `import * as components` + `Object.entries(components)`. A namespace object is
 * opaque to a bundler: once any member of it is read, every member must be kept, which
 * is why the legacy package could not tree-shake a single icon out of the entry.
 *
 * A static object literal gives the bundler a shape it can see through: an application
 * that only imports `{ SClickCopy }` (and never the default plugin export) can drop
 * everything else in this file, because `sideEffects` in `package.json` limits the
 * package's side effects to its stylesheet.
 *
 * Registering the icon set is what makes `<SIcon icon="IconVariable" />` work with a
 * *string*: `SIcon` resolves a string through Vue's component registry.
 */
import SIcon from "./icon/icon.vue";
import { iconComponents } from "./icon/icons";
import SClickCopy from "./clickCopy/ClickCopy.vue";
import SContextMenu from "./popupMenu/ContextMenu.vue";
import AliCaptcha from "./aliCaptcha/AliCaptcha.vue";
import SWordCloud from "./wordCloud/WordCloud.vue";
import SWordTag from "./wordCloud/WordTag.vue";

/**
 * 组件**名字**到组件定义的映射。
 *
 * 键即全局注册名（`SIcon`、`SClickCopy` 等），展开的 `iconComponents` 贡献整套图标；因
 * 此在这里新增一个组件就会同时改变全局注册表。
 *
 * A map from component **name** to component definition.
 *
 * The keys are the global registration names (`SIcon`, `SClickCopy`, …) and the spread
 * `iconComponents` contributes the whole icon set, so adding a component here changes the
 * global registry as well.
 */
export const components = {
  SIcon,
  SClickCopy,
  SContextMenu,
  AliCaptcha,
  SWordCloud,
  SWordTag,
  // `SContextMenuItem` is deliberately absent: it is a row of `SContextMenu`, never
  // something an application writes in a template.
  ...iconComponents
};
