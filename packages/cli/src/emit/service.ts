/**
 * Render `src/service.ts` — the single `SnailServer` subclass every api instance is
 * created from.
 *
 * ## Why one file owns the server instead of one per tag
 *
 * `@Server` namespaces plugins, caches and log lines by server name, and
 * `createApi` reads the server's options when the api instance is built. Two servers
 * with the same config would produce two plugin registries and two caches for one
 * back end, which is exactly the kind of thing that works in development and
 * misbehaves under load. One service, one place to configure interceptors and
 * plugins.
 *
 * ## Why the class is not exported
 *
 * The consumer's entry point is the `service` instance; exporting the class invites
 * `new Service()`, which would silently create a second, unconfigured server. The
 * generated barrel re-exports the instance only.
 */

import { API_PACKAGE, stringLiteral, withHeader } from "./format.js";

/** Everything `renderServiceFile` needs; both fields end up in `@Server({ … })`. */
export interface ServiceRenderOptions {
  /** `baseURL` passed to `@Server`. */
  baseUrl: string;
  /** `name` passed to `@Server`; omitted when the user did not ask for one. */
  name?: string;
}

/**
 * Render the service file.
 *
 * The class name is `Service`, matching `docs/guide/plugin-lifecycle.md`'s examples, and the
 * exported instance is always `service`, because every generated api file imports
 * that exact name.
 */
export function renderServiceFile(options: ServiceRenderOptions): string {
  const entries: string[] = [`baseURL: ${stringLiteral(options.baseUrl)}`];
  if (options.name !== undefined && options.name.length > 0) {
    entries.push(`name: ${stringLiteral(options.name)}`);
  }

  const body = [
    `import { Server, SnailServer } from ${stringLiteral(API_PACKAGE)};`,
    "",
    `@Server({ ${entries.join(", ")} })`,
    "class Service extends SnailServer {}",
    "",
    "/** 全局唯一的服务实例，所有 api 类都由它创建。 */",
    "export const service = new Service();"
  ].join("\n");

  return withHeader(body);
}
