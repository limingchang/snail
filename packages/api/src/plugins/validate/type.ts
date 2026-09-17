import type { ZodType, core } from "zod";
import { SnailError } from "../../error/base";

/**
 * Zod validation plugin types.
 *
 * `zod` is an optional peer dependency and this directory is the only place in the
 * library allowed to reference it. Everything here is a *type* reference, so
 * importing the plugin never pulls zod's runtime into the bundle: the schemas are
 * supplied by the application, which already has zod.
 */

/**
 * One problem zod reported.
 *
 * Re-exported under a library-owned name so application code can type an error
 * handler without importing zod's internal `core` namespace — the deprecation
 * churn of that namespace should not reach callers through this library.
 */
export type SnailValidationIssue = core.$ZodIssue;

/** Options accepted by the `Validate` plugin factory. */
export interface ValidateOptions {
  /** Schema applied when no `@Validate()` decorator declares one. */
  request?: ZodType;

  /** Schema applied when no `@ValidateResponse()` decorator declares one. */
  response?: ZodType;

  /**
   * Whether an invalid *request* aborts the call.
   *
   * Defaults to `true`. `false` downgrades the failure to a warning and lets the
   * request go out — useful while developing against a backend whose contract is
   * still moving, and never a good idea in production. Responses are never
   * validated strictly.
   */
  strict?: boolean;
}

/**
 * Thrown when the request payload does not satisfy its schema.
 *
 * The request is abandoned **before** anything reaches the network, which is the
 * whole point of validating a request: an invalid body that is still sent produces
 * a backend error that looks like a server bug, and a `4xx` that pollutes the
 * application's error handling for what is really a programmer mistake.
 *
 * `issues` is zod's own list, kept verbatim so the application can render field
 * paths and messages instead of parsing a string.
 */
export class SnailValidationError extends SnailError {
  /** Every issue zod reported, in zod's original shape. */
  readonly issues: readonly SnailValidationIssue[];

  constructor(
    message: string,
    options: { issues: readonly SnailValidationIssue[]; cause?: unknown }
  ) {
    super(message, { code: "SNAIL_VALIDATION_ERROR", cause: options.cause });
    this.issues = options.issues;
  }
}
