/**
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
