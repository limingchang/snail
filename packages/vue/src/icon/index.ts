import Icon from "./icon.vue";
import ElIcon from "./iconEl.vue";

Icon.install = (app:any) => {
  app.component(Icon.name || "s-icon", Icon);
};
ElIcon.install = (app:any) => {
  app.component(ElIcon.name || "s-el-icon", ElIcon);
};
export const SIcon = Icon;

export const SElIcon = ElIcon;
