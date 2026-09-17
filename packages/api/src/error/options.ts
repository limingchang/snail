import { SnailError } from "./base";

/**
 * Thrown when a required configuration block is missing — a server class
 * without `@Server()`, an api class without `@Api()`, or a value that failed
 * one of the option guards.
 */
export class SnailOptionsError extends SnailError {
  constructor(message: string, options: { cause?: unknown } = {}) {
    super(message, { code: "SNAIL_OPTIONS_ERROR", cause: options.cause });
  }
}
