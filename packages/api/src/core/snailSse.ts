import { SnailServer } from "./snailServer";

import { SseOptions, VersioningType, SseEventListener } from "../typings";
type SnailSseOptions = SseOptions & {
  path: string;
};

import { resolveUrl } from "../utils";
import { applyVersioning } from "../versioning";

import { VersioningMap } from "./snailServer";

// import keys
import {
  EVENT_SOURCE_OPTION_KEY,
  EVENT_SOURCE_EVENTS_KEY,
  EVENT_SOURCE_OPEN_KEY,
  EVENT_SOURCE_ERROR_KEY,
} from "../decorators/sse";

const defaultSseOptions: SnailSseOptions = {
  path: "",
  withCredentials: false,
};

export class SnailSse {
  private _serverInstance: SnailServer;
  private _baseUrl: string;
  private _url: string;
  private _version?: string;
  private _withCredentials: boolean;
  private _eventSource: EventSource | null;

  constructor(server: SnailServer) {
    this._serverInstance = server;
    this._baseUrl = server.baseUrl;
    // console.log('server-version:',server.version)
    const options = this.getSseOptions();
    const { path, withCredentials, version } = options;
    this._url = resolveUrl(path);
    this._version = version ?? server.version;
    this._withCredentials = withCredentials ? withCredentials : false;
    this.initVersion();
    // console.log("Sse-constructor:", this);
  }

  private getSseOptions() {
    const sseOptions = Reflect.getMetadata(
      EVENT_SOURCE_OPTION_KEY,
      this.constructor
    ) as SnailSseOptions;
    if (!sseOptions) {
      throw new Error(
        "you need to use @Sse() decorator to decorate your class"
      );
    }
    // console.log("getSseOptions:", sseOptions);
    const options = Object.assign({}, defaultSseOptions, sseOptions);
    return options;
  }

  private initVersion() {
    const versioningOptions = VersioningMap.get(this._serverInstance.name);
    if (!versioningOptions || !this._version) return;
    const versioningResult = applyVersioning(this._version, versioningOptions);
    if (!versioningResult) return;
    const { type, result } = versioningResult;
    // console.log("versioningResult:", type, result);
    if (type === VersioningType.Uri) {
      const url = `${resolveUrl(result as string)}${this._url}`;
      // console.log("versioningResult[url]:", url);
      this._url = url;
      return;
    }
    if (type === VersioningType.Query) {
      const k = Object.keys(result)[0];
      const v = (result as any)[k];
      this._url = `resolveUrl(${this._url}?${k}=${v})`;
      return;
    }
  }

  open = () => {
    const url = `${this._baseUrl}${this._url}`;
    // console.log("open sse[baseUrl]:", this._baseUrl);
    // console.log("open sse[url]:", url);
    const eventSource = new EventSource(url, {
      withCredentials: this._withCredentials,
    });
    this._eventSource = eventSource;
    this.setEvent();
    this.registerSseEvent();
    return this._eventSource;
  };

  close = () => {
    const eventSource = this.eventSource;
    if (!eventSource) return;
    eventSource.close();
  };

  private registerSseEvent() {
    const eventSource = this._eventSource;
    if (!eventSource) return;
    // console.log('registerSseEvent:',this.constructor)
    const events = Reflect.getMetadata(
      EVENT_SOURCE_EVENTS_KEY,
      this.constructor
    ) as SseEventListener[];
    // console.log('registerSseEvent:',events)
    if (!events) return;
    events.map((event) => {
      eventSource.addEventListener(event.eventName, event.emit, event.options);
    });
  }

  private setEvent() {
    // 如果被@OnSseOpen装饰
    const onOpenFunc = Reflect.getMetadata(
      EVENT_SOURCE_OPEN_KEY,
      this.constructor
    );
    // console.log("sse-proxy[open]:", onOpenFunc);
    if (typeof onOpenFunc == "function") {
      this._eventSource && (this._eventSource.onopen = onOpenFunc);
    }
    // 如果被@OnSseOpen装饰
    const onErrorFunc = Reflect.getMetadata(
      EVENT_SOURCE_ERROR_KEY,
      this.constructor
    );
    // console.log("sse-proxy[error]:", onErrorFunc);
    if (typeof onErrorFunc == "function") {
      this._eventSource && (this._eventSource.onerror = onErrorFunc);
    }
  }

  on = (
    eventName: string,
    callback: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions
  ) => {
    this._eventSource &&
      this._eventSource.addEventListener(eventName, callback, options);
  };

  off = (
    eventName: string,
    callback: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions
  ) => {
    this._eventSource &&
      this._eventSource.removeEventListener(eventName, callback, options);
  };

  get url() {
    return `${this._baseUrl}${this._url}`;
  }

  get eventSource() {
    return this._eventSource;
  }
}
