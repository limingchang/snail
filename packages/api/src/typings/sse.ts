// SSE

export type SseProxy<T extends object> = {
  [K in keyof T]: T[K] extends (...args: infer A) => any
    ? () => () => { close: () => void; eventSource: EventSource }
    : T[K];
};

export class SseEventListener {
  eventName: string;
  emit: (event: any) => any;
  options: boolean | AddEventListenerOptions;
}

export class SseOptions {
  withCredentials?: boolean;
  version?: string;
}
