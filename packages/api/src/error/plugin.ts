import { SnailError } from "./base";

/** Thrown for plugin registration, dependency and uninstall failures. */
export class SnailPluginError extends SnailError {
  /** Name of the plugin the failure belongs to, when known. */
  readonly pluginName: string | undefined;

  constructor(
    message: string,
    options: { pluginName?: string; cause?: unknown } = {}
  ) {
    super(message, { code: "SNAIL_PLUGIN_ERROR", cause: options.cause });
    this.pluginName = options.pluginName;
  }
}
