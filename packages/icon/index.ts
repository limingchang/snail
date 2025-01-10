import Icon from "./src/icon.vue";
import ElIcon from "./src/iconEl.vue";

Icon.install = (app:any) => {
  app.component(Icon.name || "s-icon", Icon);
};
ElIcon.install = (app:any) => {
  app.component(ElIcon.name || "s-el-icon", ElIcon);
};
export const SIcon = Icon;

export const SElIcon = ElIcon;
