import ClickCopy from "./src/clickCopy.vue";
import { App } from "vue";

ClickCopy.install = (app: App) => {
  app.component(ClickCopy.name || "s-click-copy", ClickCopy);
};
export const SClickCopy = ClickCopy;

export default SClickCopy;