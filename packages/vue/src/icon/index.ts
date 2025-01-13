import type { App } from "vue";
import Icon from "./icon.vue";

Icon.install = (app:App) => {
  app.component(Icon.name || "s-icon", Icon);
};

export const SIcon = Icon;

