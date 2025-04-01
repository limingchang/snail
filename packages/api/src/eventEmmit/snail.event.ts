import { SnailEventListener } from "../typings";

export class SnailEvent<DT = any> {
  private eventMap: Map<string, Set<SnailEventListener>>;
  private onceWrapperMap: Map<SnailEventListener, SnailEventListener>;

  constructor() {
    this.eventMap = new Map();
    this.onceWrapperMap = new Map();
  }
  on = <ErrorData = any>(
    eventName: string,
    listener: SnailEventListener<DT, ErrorData>
  ) => {
    // 绑定事件
    if (typeof listener !== "function") {
      throw new TypeError("Handler must be a function");
    }
    const listeners = this.eventMap.get(eventName) || new Set();
    listeners.add(listener);
    this.eventMap.set(eventName, listeners);
  };
  off = (eventName: string, listener: SnailEventListener<DT>) => {
    // 移除事件
    const listeners = this.eventMap.get(eventName);
    if (!listeners) return;

    // 双保险删除（直接删除+通过once包装删除）
    if (this.onceWrapperMap.has(listener)) {
      this.onceWrapperMap.delete(listener);
    }
    // 清理空队列
    if (listeners.size === 0) {
      this.eventMap.delete(eventName);
    }
  };
  once = (eventName: string, listener: SnailEventListener<DT>) => {
    // 绑定一次性事件
    const onceHandler = (data?: DT) => {
      // 先执行再清理（避免中途报错导致未清理）
      try {
        listener.apply(this, [data]);
      } finally {
        this.off(eventName, onceHandler);
        this.onceWrapperMap.delete(listener);
      }
    };

    // 建立原始handler与包装后的映射
    this.onceWrapperMap.set(listener, onceHandler);
    this.on(eventName, onceHandler);
  };

  emit = (eventName: string, ...args: any) => {
    // 触发事件
    const listeners = this.eventMap.get(eventName);
    if (!listeners || listeners.size === 0) return false;
    // 创建副本执行（防止执行过程中修改队列）
    listeners.forEach((listener) => {
      // 异步执行更贴近实际场景
      Promise.resolve().then(() => {
        listener.apply(this, args);
      });
    });
    return true;
  };
}
