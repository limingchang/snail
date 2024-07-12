export const setSymbol = (target: Object, key: string, value: any) => {
  // console.log("target:", target);
  Reflect.set(target, Symbol.for(key), value);
  // target[Symbol.for(key)] = value;
  return target;
};

export const getSymbol = (target: Object, key: string): string | undefined => {
  return Reflect.get(target, Symbol.for(key));
};
