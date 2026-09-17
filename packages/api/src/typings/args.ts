import type { SnailContext } from "../core/context";

/**
 * Built-in parameter sources.
 *
 * `"params"` → path placeholders, `"query"` → query string, `"data"` → request
 * body, `"header"` → request header.
 */
export type SnailBuiltinParamSource = "params" | "query" | "data" | "header";

/**
 * A parameter source — a built-in name, or any string a plugin registered
 * through `createParamDecorator`.
 */
export type SnailParamSource = SnailBuiltinParamSource | (string & {});

/** Everything a parameter resolver needs to place one argument. */
export interface SnailParamResolverInput {
  /** Live request context; mutate `ctx.request` to affect the outgoing request. */
  ctx: SnailContext;
  /** The runtime argument value at `index`. */
  value: unknown;
  /** The key passed to the decorator, when one was given. */
  key: string | undefined;
  /** Extra options passed to the decorator, when any. */
  options: unknown;
  /** Position of the argument in the method signature. */
  index: number;
  /** Method name the argument belongs to. */
  methodName: string;
}

/**
 * Applies one decorated argument to the request context.
 *
 * Built-in sources use the resolvers in `core/args.ts`; plugins add their own
 * through `createParamDecorator`.
 */
export type SnailParamResolver = (input: SnailParamResolverInput) => void;

/** One `@Query()` / `@Params()` / custom parameter decorator application. */
export interface SnailParamDescriptor {
  /** e.g. `"query"`, `"params"`, `"data"`, `"header"`, or a plugin's source name. */
  readonly source: SnailParamSource;
  /** Position in the method signature. */
  readonly index: number;
  /** Key passed to the decorator, if any. */
  readonly key?: string;
  /** Extra options passed to the decorator, if any. */
  readonly options?: unknown;
  /** How to apply this argument to the context. */
  readonly resolve: SnailParamResolver;
}

/** A record-shaped value contributed to the request. */
export type SnailParamRecord = Record<string, unknown>;
