import { SnailModelOptions, SnailFieldOptions } from "./types";
import { setModelMeta } from "./utils";
import { DEFAULT_FIELD_OPTIONS } from "./constant";

export const Model = (options: SnailModelOptions) => {
  const fn: ClassDecorator = (target: any) => {
    Object.keys(options).forEach((key) => {
      setModelMeta(target.prototype, key, (options as any)[key]);
    });
  };
  return fn;
};

export const Field = (options?: SnailFieldOptions): PropertyDecorator => {
  let config: SnailFieldOptions = DEFAULT_FIELD_OPTIONS;
  if (options) {
    config = {
      ...config,
      ...options,
    };
  }

  const fn: PropertyDecorator = (target: Object, key: string | symbol) => {
    const keyStr = typeof key === "symbol" ? key.toString() : key;
    setModelMeta(target, `[required]${keyStr}`, config.required);
    setModelMeta(target, `[default]${keyStr}`, config.default);
    if ((config as SnailFieldOptions<{ alias: string }>).alias) {
      setModelMeta(
        target,
        `[alias]${keyStr}`,
        (config as SnailFieldOptions<{ alias: string }>).alias
      );
    }
    if ((config as SnailFieldOptions<{ prefix: string }>).prefix) {
      setModelMeta(
        target,
        `[prefix]${keyStr}`,
        (config as SnailFieldOptions<{ prefix: string }>).prefix
      );
    }
  };
  return fn;
};
