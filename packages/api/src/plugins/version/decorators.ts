import { defineMetadata, getMetadata } from "../../core/metadata";
import { customMetadataKey } from "../../decorators/custom";
import { SnailDecoratorError } from "../../error/decorator";

/**
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
 * Read the version declared for one method.
 *
 * Reads the method slot first, then the class slot, and both walk the prototype
 * chain so a subclass inherits the version of its base api class.
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
