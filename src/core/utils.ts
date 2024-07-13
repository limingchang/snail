export const setSymbol = (target: Object, key: string, value: any) => {
  // console.log("target:", target);
  Reflect.set(target, Symbol.for(key), value);
  // target[Symbol.for(key)] = value;
  return target;
};

export const getSymbol = (target: Object, key: string): string | undefined => {
  return Reflect.get(target, Symbol.for(key));
};


export function isNonNull<T>(obj: T | null): obj is T {
  return obj != null;
}

export const getSymbolFields = (prototype:object) => {
  const fields = Reflect.ownKeys(prototype).filter(field => typeof field === "symbol").map(field => field.toString())
  const fieldRegx = /^Symbol\(field\[(.*)\]\)$/;

  return fields.filter(field=>field.match(fieldRegx)).map(field=>field.match(fieldRegx)![1]);
}