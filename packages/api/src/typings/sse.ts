// SSE 

export type SseProxy<T extends object> = {
  [K in keyof T]: T[K] extends (...args: infer A) => any
    ? () => { sourceEvent: EventSource; close: Function }
    : T[K];
};

export class RegisterSseEvent {
  eventName: string;
  emit: (event: any) => any;
  options: boolean | AddEventListenerOptions;
}
