/**
 * 版本管理插件。
 *
 * 用 `Service.use(Versioning({...}))` 安装，再用 `@Version("1.2.0")` 声明类或方法的版本；
 * 插件会在每个请求上把版本写进 url、请求头或 query。
 *
 * Version management plugin.
 *
 * ```ts
 * import { Version, Versioning } from "@snail-js/api/plugins";
 *
 * Service.use(Versioning({ type: "url", defaultVersion: "1.0.0" }));
 *
 * @Api("/user")
 * @Version("1.2.0")
 * class UserApi {
 *   @Get("/:id")
 *   getUser(@Params("id") id: string): Promise<User> { return null!; }
 * }
 * // → GET /api/v1.2.0/user/1
 * ```
 *
 * @packageDocumentation
 */

export { Version } from "./decorators";
export { VERSIONING_PRIORITY, Versioning } from "./plugin";
export type { VersioningOptions, VersioningPatch, VersioningType } from "./type";
