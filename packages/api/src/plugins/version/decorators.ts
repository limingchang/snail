import { defineMetadata, getMetadata } from "../../core/metadata";
import { customMetadataKey } from "../../decorators/custom";
import { SnailDecoratorError } from "../../error/decorator";

/**
 * `@Version(...)`——声明类或单个方法的 api 版本。
 *
 * 方法优先于类，类优先于插件的 `defaultVersion`；这是唯一一种能让类中某个接口偏离、又不
 * 必强迫每个同级方法重述类版本的顺序。
 *
 * 装饰器刻意只写元数据：它从不触碰请求或服务端，所以给来自共享模块的类加装饰器，不会把
 * 版本泄漏进另一个服务实例。
 *
 * `@Version(...)` — declare the api version of a class or of one method.
 *
 * Method wins over class, class wins over the plugin's `defaultVersion`, which is
 * the only ordering that lets one endpoint of a class deviate without forcing
 * every sibling to restate the class version.
 *
 * The decorator is intentionally metadata-only: it never touches the request or
 * the server, so decorating a class from a shared module cannot leak a version
 * into another server instance.
 */

/**
 * Metadata slot written by `@Version`.
 *
 * One key covers both levels: a class decorator stores under the class slot and a
 * method decorator under the method name, so a reader never has to know which
 * decorator wrote the value.
 */
const VERSION_KEY = customMetadataKey("versioning/version");

/**
 * 声明一个 api 类或单个请求方法的版本。
 *
 * Declare the version of an api class or of a single request method.
 *
 * ```ts
 * @Api("/user")
 * @Version("1.2.0")
 * class UserApi {
 *   @Get("/legacy")
 *   @Version("0.9.0")
 *   legacy(): Promise<void> { return null!; }
 * }
 * ```
 *
 * @param version 非空的版本字符串 / A non-empty version string.
 * @returns 同时可用作类装饰器与方法装饰器 / A class and method decorator.
 * @throws {SnailDecoratorError} 版本不是非空字符串时抛出 / Thrown when `version` is not a
 *   non-empty string.
 */
export function Version(version: string): ClassDecorator & MethodDecorator {
  if (typeof version !== "string" || version.length === 0) {
    throw new SnailDecoratorError(
      "[snail] @Version() requires a non-empty version string"
    );
  }

  return ((target: unknown, propertyKey?: string | symbol) => {
    defineMetadata(VERSION_KEY, version, target, propertyKey);
  }) as ClassDecorator & MethodDecorator;
}

/**
 * 读取某个方法声明过的版本。
 *
 * 先读方法槽位，再读类槽位，两者都会沿原型链向上查找，所以子类会继承基类 api 的版本。
 *
 * Read the version declared for one method.
 *
 * Reads the method slot first, then the class slot, and both walk the prototype
 * chain so a subclass inherits the version of its base api class.
 *
 * @param apiClass api 类 / The api class.
 * @param methodName 方法名 / The method name.
 * @returns 声明过的版本，没有则为 `undefined` / The declared version, or `undefined`.
 */
export function resolveDeclaredVersion(
  apiClass: unknown,
  methodName: string
): string | undefined {
  return (
    getMetadata<string>(VERSION_KEY, apiClass, methodName) ??
    getMetadata<string>(VERSION_KEY, apiClass)
  );
}
