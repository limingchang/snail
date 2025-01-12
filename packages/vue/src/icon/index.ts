import Icon from "./icon.vue";

Icon.install = (app:any) => {
  app.component(Icon.name || "s-icon", Icon);
};

export const SIcon = Icon;

