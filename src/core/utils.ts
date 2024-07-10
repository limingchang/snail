export const setSymbol = (target: any, key: string, value: any) => {
  target[Symbol.for(key)] = value
  return target
}

export const getSymbol = (target: any, key: string) => {
  return target[Symbol.for(key)]
}