import { Sse, SseEvent, OnSseError, OnSseOpen,SnailSse } from "@snail-js/api";

import { Service } from "./service";

@Sse("system/sse", {
  withCredentials: true,
})
class System extends SnailSse {
  
  @OnSseOpen()
  handleOpen(event: Event) {
    console.log("sse-open[System]:", event);
  }

  @OnSseError()
  handleError(event: Event) {
    console.log("sse-error[System]:", event);
  }

  @SseEvent()
  handleEvent(event: MessageEvent) {
    console.log("sse-event[System]:", event.data);
  }
}

const ACCESS_TOKEN =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6ImxpbWljaCIsInN1YiI6IjY1NTE4N2EzNzVjZGM0MTAwNDQzMzJkMCIsImlhdCI6MTczOTc3MzIzNCwiZXhwIjoxNzM5ODU5NjM0LCJpc3MiOiJ0dW95dWFuLmxpbWljaC5jbiJ9.dFB2osguQhspQSqEYrw7bwXKZ32mO3_WsaZVsnqm34g";

document.cookie = `Access-Token=${ACCESS_TOKEN}`;

export const SystemSse = Service.createSse(System);
