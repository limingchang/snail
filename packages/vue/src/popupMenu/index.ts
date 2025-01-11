// export * from './PopupMenu'
import PopupMenu from "./PopupMenu.vue";

PopupMenu.install = (app:any) => {
  app.component(PopupMenu.name || "s-popup-menu", PopupMenu);
};

export * from './type'
export const SPopupMenu = PopupMenu;