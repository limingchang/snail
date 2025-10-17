class EventEmitter {
  private events: Map<string, Function[]> = new Map();
  //  events: Map<string, Function[]> = new Map();

  on(event: string, listener: Function) {
    const listeners = this.events.get(event) || [];
    listeners.push(listener);
    this.events.set(event, listeners);
  }

  emit(event: string, ...args: any[]){
    const listeners = this.events.get(event) || [];
    listeners.forEach((listener) => listener(...args));
  }

  off(event: string, listener: Function) {
    const listeners = this.events.get(event) || [];
    this.events.set(event, listeners.filter((l) => l !== listener));
  }

  once(event: string, listener: Function) {
    const wrapper = (...args: any[]) => {
      listener(...args);
      this.off(event, wrapper);
    };
    this.on(event, wrapper);
  }
}
export const eventEmitter = new EventEmitter();