import type { App } from "vue";
import ClickCopy from "./ClickCopy.vue";

ClickCopy.install = (app:App) => {
  app.component(ClickCopy.name || "s-click-copy", ClickCopy);
};
export const SClickCopy = ClickCopy;

export default SClickCopy;