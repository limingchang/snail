import type { App } from "vue";
import AiChat from "./AiChat.vue";

AiChat.install = (app:App) => {
  app.component(AiChat.name || "s-click-copy", AiChat);
};
export const SAiChat = AiChat;

export default SAiChat;