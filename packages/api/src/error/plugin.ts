import { SnailError } from "./base";

/**
 * 插件注册、依赖与卸载失败时抛出。
 *
 * Thrown for plugin registration, dependency and uninstall failures.
 */
export class SnailPluginError extends SnailError {
  /**
   * 失败所属的插件名（已知时）。
   *
   * Name of the plugin the failure belongs to, when known.
   */
  readonly pluginName: string | undefined;

  /**
   * 构造一个插件错误。
   *
   * 错误码固定为 `SNAIL_PLUGIN_ERROR`。
   *
   * Build a plugin error.
   *
   * The code is always `SNAIL_PLUGIN_ERROR`.
   *
   * @param message 供人阅读的错误信息 / Human-readable error message
   * @param options 可选的插件名与底层原因 / Optional plugin name and underlying cause
   */
  constructor(
    message: string,
    options: { pluginName?: string; cause?: unknown } = {}
  ) {
    super(message, { code: "SNAIL_PLUGIN_ERROR", cause: options.cause });
    this.pluginName = options.pluginName;
  }
}
