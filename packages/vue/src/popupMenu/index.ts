import type { App } from "vue";
import PopupMenu from "./PopupMenu.vue";

PopupMenu.install = (app:App) => {
  app.component(PopupMenu.name || "s-popup-menu", PopupMenu);
};

export * from './type'
export const SPopupMenu = PopupMenu;