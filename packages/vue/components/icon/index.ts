import Icon from "./src/icon.vue";
import { App } from "vue";

Icon.install = (app: App) => {
  app.component(Icon.name || "s-icon", Icon);
};
export const SIcon = Icon;

export default SIcon;
