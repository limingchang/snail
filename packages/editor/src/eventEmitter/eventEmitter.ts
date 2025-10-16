class EventEmitter {
  // private events: Map<string, Function[]> = new Map();
   events: Map<string, Function[]> = new Map();

  on(event: string, listener: Function) {
    const listeners = this.events.get(event) || [];
    listeners.push(listener);
    this.events.set(event, listeners);
  }

  emit(event: string, ...args: any[]){
    const listeners = this.events.get(event) || [];
    listeners.forEach((listener) => listener(...args));
  }
}
export const eventEmitter = new EventEmitter();