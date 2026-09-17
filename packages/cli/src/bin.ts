#!/usr/bin/env node
/**
 * `snail` — command line entry point.
 *
 * ## Why argument parsing is a pure exported function
 *
 * Parsing is the part of a CLI that is worth testing exhaustively (aliases, `=`-style
 * values, unknown flags, missing values) and the part that is hardest to test through a
 * spawned process — which a confined environment cannot do at all. `parseArgv` therefore
 * takes `argv` and returns a value: no `process`, no exit, no I/O. `runCli` adds the I/O
 * around it, and the bottom of this file is the only code that touches `process.argv`.
 *
 * ## Why exit codes are separated
 *
 * `0` success, `1` failure, `2` usage error. A usage error means *nothing was
 * attempted*; a build script can retry or fall back on `1` but must fix its invocation
 * on `2`. Collapsing them loses that distinction irreversibly.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { runGenerate, type GenerateCommandOptions } from "./commands/generate.js";
import { runInit, type InitCommandOptions } from "./commands/init.js";
import { createLogger, resolveLogLevel, type Logger } from "./logger.js";
import { UsageError } from "./index.js";

/** A parsed command line. */
export type Command =
  | { kind: "generate"; options: GenerateCommandOptions }
  | { kind: "init"; options: InitCommandOptions }
  | { kind: "help" }
  | { kind: "version" };

/** The CLI's usage error, re-exported so `bin` consumers see one class. */
export { UsageError };

const GENERATE_FLAGS = new Set([
  "input",
  "out",
  "base-url",
  "name",
  "tags",
  "exclude-tags",
  "dry-run",
  "force",
  "verbose",
  "clean"
]);

const INIT_FLAGS = new Set(["out", "force", "name", "base-url"]);

/** Chinese, because the README and generated comments are; option names stay English. */
export const HELP_TEXT = `snail — 从 OpenAPI 3 文档生成 @snail-js/api 请求代码

用法:
  snail init [选项]
  snail generate --input <file> [选项]
  snail g --input <file> [选项]        # generate 的别名

init 选项:
  -o, --out <dir>        生成目录（默认 src/service）
      --name <name>      @Server 的 name
      --base-url <url>   @Server 的 baseURL（默认 /api）
      --force            覆盖已存在的文件

generate 选项:
  -i, --input <file>     OpenAPI 3.0/3.1 文档，支持 .json / .yaml / .yml（必填）
  -o, --out <dir>        源码根目录，生成器在其下建 apis/ 与 types/（默认 src）
      --base-url <url>   覆盖 @Server 的 baseURL（默认取 servers[0].url）
      --name <name>      @Server 的 name
      --tags a,b,c       只生成这些 tag（无 tag 的操作属于 default）
      --exclude-tags a,b 排除这些 tag
      --dry-run          只打印会写入的文件，不落盘
      --force            覆盖非本工具生成的文件
      --clean            先删除输出目录中本工具生成的文件
      --verbose          输出调试信息（失败时附带调用栈）

通用:
  -h, --help             显示帮助
  -V, --version          显示版本
`;

function isFlag(token: string): boolean {
  return token.startsWith("-") && token !== "-";
}

/** Split `--tags a,b , c` into a normalised list. */
function parseList(value: string, flag: string): string[] {
  const items = value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  if (items.length === 0) {
    throw new UsageError(`option "${flag}" needs at least one comma-separated value.`);
  }

  return items;
}

/**
 * Parse `argv` (without `node` and the script path).
 *
 * Supports both `--flag value` and `--flag=value`; the latter is what a shell produces
 * when a script passes `--input="$SPEC"`, and rejecting it produces a confusing
 * "unknown option" for a perfectly normal invocation.
 */
export function parseArgv(argv: readonly string[]): Command {
  const args = [...argv];
  if (args.length === 0) return { kind: "help" };

  let index = 0;
  const command = args[index] as string;

  if (command === "--help" || command === "-h" || command === "help") return { kind: "help" };
  if (command === "--version" || command === "-V" || command === "version") return { kind: "version" };

  const isGenerate = command === "generate" || command === "g";
  const isInit = command === "init";

  if (!isGenerate && !isInit) {
    throw new UsageError(`unknown command "${command}". Run "snail --help" for usage.`);
  }

  index += 1;
  const allowed = isGenerate ? GENERATE_FLAGS : INIT_FLAGS;
  const values = new Map<string, string>();
  const flags = new Set<string>();

  while (index < args.length) {
    const token = args[index] as string;

    if (!isFlag(token)) {
      throw new UsageError(`unexpected argument "${token}". Run "snail --help" for usage.`);
    }

    const body = token.replace(/^--?/, "");
    const separator = body.indexOf("=");
    const name = separator === -1 ? body : body.slice(0, separator);
    const inlineValue = separator === -1 ? undefined : body.slice(separator + 1);

    if (name === "help" || name === "h") return { kind: "help" };
    if (name === "version" || name === "V") return { kind: "version" };

    // Short aliases are accepted on both subcommands; only the long set is validated,
    // so `-i` and `--input` cannot drift apart.
    const canonical =
      name === "i" && isGenerate ? "input" : name === "o" ? "out" : name;

    if (!allowed.has(canonical)) {
      throw new UsageError(`unknown option "${token}". Run "snail --help" for usage.`);
    }

    if (canonical === "dry-run" || canonical === "force" || canonical === "verbose" || canonical === "clean") {
      if (inlineValue !== undefined) {
        throw new UsageError(`option "${token}" is a flag and takes no value.`);
      }
      flags.add(canonical);
      index += 1;
      continue;
    }

    let value = inlineValue;
    if (value === undefined) {
      const next = args[index + 1];
      if (next === undefined || (isFlag(next) && !/^-\d/.test(next))) {
        throw new UsageError(`option "${token}" needs a value.`);
      }
      value = next;
      index += 1;
    }

    values.set(canonical, value);
    index += 1;
  }

  if (isGenerate) {
    const tags = values.get("tags");
    const excludeTags = values.get("exclude-tags");
    return {
      kind: "generate",
      options: {
        input: values.get("input"),
        out: values.get("out"),
        baseUrl: values.get("base-url"),
        name: values.get("name"),
        tags: tags === undefined ? undefined : parseList(tags, "--tags"),
        excludeTags: excludeTags === undefined ? undefined : parseList(excludeTags, "--exclude-tags"),
        dryRun: flags.has("dry-run"),
        force: flags.has("force"),
        verbose: flags.has("verbose"),
        clean: flags.has("clean")
      }
    };
  }

  return {
    kind: "init",
    options: {
      out: values.get("out"),
      name: values.get("name"),
      baseUrl: values.get("base-url"),
      force: flags.has("force")
    }
  };
}

/** Sinks the CLI writes to; injectable so tests can capture output without a process. */
export interface CliIo {
  stdout?: (chunk: string) => void;
  stderr?: (chunk: string) => void;
}

/**
 * Read the version from the package manifest.
 *
 * Resolved through `import.meta.url` rather than a hard-coded constant so the published
 * version and `--version` cannot disagree, and reading a file keeps it working whether
 * the module is loaded from `src/` or `dist/` (both are one level below the package
 * root).
 */
function readVersion(): string {
  try {
    const manifest = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8")
    ) as { version?: string };
    return manifest.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function reportError(error: unknown, logger: Logger, verbose: boolean): number {
  const message = error instanceof Error ? error.message : String(error);
  logger.error(message);
  if (verbose && error instanceof Error && error.stack) logger.error(error.stack);
  return error instanceof UsageError ? 2 : 1;
}

/**
 * Run the CLI and return its exit code.
 *
 * Never throws and never calls `process.exit`: the code is returned so a test can assert
 * on it, and `process.exitCode` is set by the caller so Node can flush stdout first.
 */
export async function runCli(argv: readonly string[], io: CliIo = {}): Promise<number> {
  const baseLogger = createLogger({ stdout: io.stdout, stderr: io.stderr });

  let command: Command;
  try {
    command = parseArgv(argv);
  } catch (error) {
    return reportError(error, baseLogger, false);
  }

  if (command.kind === "help") {
    baseLogger.out(HELP_TEXT);
    return 0;
  }

  if (command.kind === "version") {
    baseLogger.out(readVersion());
    return 0;
  }

  const verbose = command.kind === "generate" && command.options.verbose === true;
  const logger = createLogger({
    stdout: io.stdout,
    stderr: io.stderr,
    level: resolveLogLevel({ verbose })
  });

  try {
    if (command.kind === "generate") return await runGenerate(command.options, logger);
    return await runInit(command.options, logger);
  } catch (error) {
    return reportError(error, logger, verbose);
  }
}

/** `true` when this module is the process entry point, not an import from a test. */
export function isMainModule(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) return false;
  try {
    return pathToFileURL(resolve(entry)).href === import.meta.url;
  } catch {
    return false;
  }
}

if (isMainModule()) {
  void runCli(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
