/**
 * 错误类型。
 *
 * 库可能抛出的每一种错误；它们全部继承自 {@link SnailError}，并各自带有稳定的
 * `code`，便于应用代码按类型分支。
 *
 * Error types.
 *
 * Every error kind the library throws; all extend {@link SnailError} and carry a
 * stable `code` so application code can branch without importing the class.
 */
export { SnailError } from "./base";
export { SnailDecoratorError } from "./decorator";
export { SnailHookError } from "./hook";
export { SnailOptionsError } from "./options";
export { SnailPluginError } from "./plugin";
export { SnailHttpError, SnailResponseError } from "./response";
export { SnailCancelledError, SnailRequestError, SnailTimeoutError } from "./request";
