import Mobile from "./Mobile.vue"

Mobile.install = (app:any) => {
  app.component(Mobile.name || "s-mobile", Mobile);
};
export const IconMobile = Mobile;

import Sign from "./Sign.vue"

Sign.install = (app:any) => {
  app.component(Sign.name || "s-sign", Sign);
};
export const IconSign = Sign;

import FolderFill from "./FolderFill.vue";

FolderFill.install = (app:any) => {
  app.component(FolderFill.name || "s-folder-fill", FolderFill);
};

export const IconFolderFill = FolderFill;



import SnailFill from "./SnailFill.vue";
SnailFill.install = (app:any) => {
  app.component(SnailFill.name || "s-snail-fill", SnailFill);
};
export const IconSnailFill = SnailFill;

import Folder from "./Folder.vue";
Folder.install = (app:any) => {
  app.component(Folder.name || "s-folder", Folder);
};
export const IconFolder = Folder;

