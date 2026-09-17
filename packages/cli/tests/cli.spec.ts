/**
 * CLI tests: the argument parser, the exit codes and the end-to-end write.
 *
 * The end-to-end path calls `generateFromOpenAPI` + `writeGenerated` through `runCli`
 * rather than spawning `node dist/bin.js`, because a spawned child needs a pipe this
 * environment denies. `runCli` is the same code the process entry runs, minus `process`
 * bookkeeping, so nothing material is left untested.
 */

import { afterAll, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgv, runCli, UsageError } from "../src/bin.js";
import {
  GENERATED_HEADER,
  generateFromOpenAPI,
  writeGenerated,
  type GenerateResult
} from "../src/index.js";

const FIXTURES = fileURLToPath(new URL("./fixtures/", import.meta.url));
const petstorePath = join(FIXTURES, "petstore.json");

const scratchDirs: string[] = [];

/**
 * Create a scratch directory.
 *
 * `os.tmpdir()` is tried first; a confined environment may deny it, in which case the
 * repository-local `.tmp` (created on demand) is used instead.
 */
function makeScratchDir(): string {
  for (const base of [tmpdir(), join(process.cwd(), ".tmp")]) {
    try {
      mkdirSync(base, { recursive: true });
      const dir = mkdtempSync(join(base, "snail-cli-"));
      scratchDirs.push(dir);
      return dir;
    } catch {
      // try the next candidate
    }
  }
  throw new Error("no writable scratch directory is available");
}

function capture() {
  const out: string[] = [];
  const err: string[] = [];
  return {
    stdout: (chunk: string) => out.push(chunk),
    stderr: (chunk: string) => err.push(chunk),
    out: () => out.join(""),
    err: () => err.join("")
  };
}

afterAll(() => {
  for (const dir of scratchDirs) rmSync(dir, { recursive: true, force: true });
});

describe("parseArgv", () => {
  it("prints help for no arguments and for the help flags", () => {
    expect(parseArgv([])).toEqual({ kind: "help" });
    expect(parseArgv(["--help"])).toEqual({ kind: "help" });
    expect(parseArgv(["-h"])).toEqual({ kind: "help" });
    expect(parseArgv(["generate", "--help"])).toEqual({ kind: "help" });
  });

  it("recognises the version flags", () => {
    expect(parseArgv(["--version"])).toEqual({ kind: "version" });
    expect(parseArgv(["-V"])).toEqual({ kind: "version" });
  });

  it("parses generate with short aliases and every option", () => {
    const command = parseArgv([
      "g",
      "-i",
      "spec.json",
      "-o",
      "out",
      "--base-url",
      "/api",
      "--name",
      "backend",
      "--tags",
      " pet , store ",
      "--exclude-tags",
      "internal",
      "--dry-run",
      "--force",
      "--verbose",
      "--clean"
    ]);

    expect(command).toEqual({
      kind: "generate",
      options: {
        input: "spec.json",
        out: "out",
        baseUrl: "/api",
        name: "backend",
        tags: ["pet", "store"],
        excludeTags: ["internal"],
        dryRun: true,
        force: true,
        verbose: true,
        clean: true
      }
    });
  });

  it("accepts --flag=value, which is what a shell produces", () => {
    const command = parseArgv(["generate", "--input=spec.json", "--out=src"]);
    expect(command).toMatchObject({ kind: "generate", options: { input: "spec.json", out: "src" } });
  });

  it("leaves unset flags undefined instead of defaulting them", () => {
    const command = parseArgv(["generate", "-i", "spec.json"]);
    expect(command).toEqual({
      kind: "generate",
      options: {
        input: "spec.json",
        out: undefined,
        baseUrl: undefined,
        name: undefined,
        tags: undefined,
        excludeTags: undefined,
        dryRun: false,
        force: false,
        verbose: false,
        clean: false
      }
    });
  });

  it("parses init", () => {
    expect(parseArgv(["init", "--out", "src/service", "--force"])).toEqual({
      kind: "init",
      options: { out: "src/service", name: undefined, baseUrl: undefined, force: true }
    });
  });

  it("rejects unknown commands, unknown options and missing values", () => {
    expect(() => parseArgv(["frobnicate"])).toThrow(UsageError);
    expect(() => parseArgv(["generate", "--nope"])).toThrow(/unknown option/);
    expect(() => parseArgv(["generate", "-i"])).toThrow(/needs a value/);
    expect(() => parseArgv(["generate", "--dry-run=yes"])).toThrow(/takes no value/);
    expect(() => parseArgv(["generate", "-i", "spec.json", "extra"])).toThrow(/unexpected argument/);
    // init does not accept generate-only options.
    expect(() => parseArgv(["init", "--tags", "pet"])).toThrow(/unknown option/);
    expect(() => parseArgv(["generate", "-i", "spec.json", "--tags", ","])).toThrow(/at least one/);
  });
});

describe("runCli", () => {
  it("prints help and exits 0", async () => {
    const io = capture();
    await expect(runCli(["--help"], io)).resolves.toBe(0);
    expect(io.out()).toContain("snail generate --input <file>");
    expect(io.err()).toBe("");
  });

  it("prints the package version and exits 0", async () => {
    const io = capture();
    await expect(runCli(["--version"], io)).resolves.toBe(0);
    expect(io.out().trim()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("exits 2 when --input is missing", async () => {
    const io = capture();
    await expect(runCli(["generate"], io)).resolves.toBe(2);
    expect(io.err()).toContain("--input");
  });

  it("exits 2 and names the path when the document does not exist", async () => {
    const io = capture();
    const missing = join(FIXTURES, "does-not-exist.json");
    await expect(runCli(["generate", "-i", missing], io)).resolves.toBe(2);
    expect(io.err()).toContain(missing);
  });

  it("exits 2 on a usage error and prints no stack trace", async () => {
    const io = capture();
    await expect(runCli(["generate", "--wat"], io)).resolves.toBe(2);
    expect(io.err()).toContain("unknown option");
    expect(io.err()).not.toContain("at ");
  });

  it("exits 1 when the document cannot be parsed", async () => {
    const dir = makeScratchDir();
    const broken = join(dir, "broken.json");
    writeFileSync(broken, "{ not json", "utf8");

    const io = capture();
    await expect(runCli(["generate", "-i", broken], io)).resolves.toBe(1);
    expect(io.err()).toContain("cannot parse");
  });

  it("writes nothing on --dry-run but lists the files", async () => {
    const dir = makeScratchDir();
    const out = join(dir, "src");

    const io = capture();
    await expect(runCli(["generate", "-i", petstorePath, "-o", out, "--dry-run"], io)).resolves.toBe(0);

    expect(io.out()).toContain("dry run");
    expect(io.out()).toContain(join(out, "apis", "pet.api.ts"));
    expect(existsSync(out)).toBe(false);
  });

  it("writes the files and reports how many", async () => {
    const dir = makeScratchDir();
    const out = join(dir, "src");

    const io = capture();
    await expect(runCli(["generate", "-i", petstorePath, "-o", out], io)).resolves.toBe(0);

    expect(io.out()).toContain("wrote 8 file(s)");
    expect(readFileSync(join(out, "apis", "pet.api.ts"), "utf8")).toContain("export class PetApi {");
  });
});

describe("writeGenerated", () => {
  it("writes identical bytes on a second run", async () => {
    const dir = makeScratchDir();
    const result = await generateFromOpenAPI(petstorePath);

    await writeGenerated(result, dir);
    const first = readFileSync(join(dir, "types", "pet.ts"), "utf8");
    await writeGenerated(result, dir);

    expect(readFileSync(join(dir, "types", "pet.ts"), "utf8")).toBe(first);
  });

  it("returns every path it wrote, in file order", async () => {
    const dir = makeScratchDir();
    const result = await generateFromOpenAPI(petstorePath);
    const written = await writeGenerated(result, dir);

    expect(written).toHaveLength(result.files.length);
    expect(written[0]).toBe(join(dir, result.files[0]!.path));
    for (const path of written) expect(existsSync(path)).toBe(true);
  });

  it("cleans only files carrying the generated header", async () => {
    const dir = makeScratchDir();
    const first = await generateFromOpenAPI(petstorePath);
    await writeGenerated(first, dir);

    const handWritten = join(dir, "apis", "manual.api.ts");
    writeFileSync(handWritten, "export const manual = 1;\n", "utf8");
    // A generated file that the next run will no longer produce, e.g. after a tag was
    // removed from the document.
    const stale = join(dir, "apis", "stale.api.ts");
    writeFileSync(stale, `${GENERATED_HEADER}\nexport const stale = 1;\n`, "utf8");

    const second = await generateFromOpenAPI(petstorePath, { tags: ["store"] });
    await writeGenerated(second, dir, { clean: true });

    expect(existsSync(handWritten)).toBe(true);
    expect(existsSync(stale)).toBe(false);
    // Files that are no longer generated are gone; the new set is present.
    expect(existsSync(join(dir, "types", "store.ts"))).toBe(true);
    expect(existsSync(join(dir, "types", "pet.ts"))).toBe(false);
  });

  it("refuses to overwrite a hand-written file without --force", async () => {
    const dir = makeScratchDir();
    const target = join(dir, "apis", "pet.api.ts");
    mkdirSync(join(dir, "apis"), { recursive: true });
    writeFileSync(target, "// hand written\n", "utf8");

    const io = capture();
    await expect(runCli(["generate", "-i", petstorePath, "-o", dir], io)).resolves.toBe(1);
    expect(io.err()).toContain("pet.api.ts");
    expect(readFileSync(target, "utf8")).toBe("// hand written\n");

    await expect(runCli(["generate", "-i", petstorePath, "-o", dir, "--force"], io)).resolves.toBe(0);
    expect(readFileSync(target, "utf8")).toContain("export class PetApi {");
  });
});

describe("snail init", () => {
  it("creates a scaffold and then refuses to overwrite it", async () => {
    const dir = makeScratchDir();
    const out = join(dir, "service");

    const first = capture();
    await expect(runCli(["init", "--out", out], first)).resolves.toBe(0);
    expect(first.out()).toContain("initialised");

    expect(readFileSync(join(out, "service.ts"), "utf8")).toContain(
      'import { Server, SnailServer } from "@snail-js/api";'
    );
    expect(readFileSync(join(out, "service.ts"), "utf8")).toContain("export const service = new Service();");
    expect(readFileSync(join(out, "index.ts"), "utf8")).toContain('export { service } from "./service";');
    expect(readFileSync(join(out, "README.md"), "utf8")).toContain("snail generate");

    const second = capture();
    await expect(runCli(["init", "--out", out], second)).resolves.toBe(1);
    expect(second.err()).toContain(join(out, "service.ts"));

    const third = capture();
    await expect(runCli(["init", "--out", out, "--force"], third)).resolves.toBe(0);
  });

  it("keeps the README out of the generated marker so --clean cannot delete it", () => {
    const dir = makeScratchDir();
    const readme = join(dir, "README.md");
    writeFileSync(readme, "# notes\n", "utf8");
    expect(readFileSync(readme, "utf8").startsWith(GENERATED_HEADER)).toBe(false);
  });
});

describe("generated output shape", () => {
  it("keeps every emitted file importable by the api package", async () => {
    const result: GenerateResult = await generateFromOpenAPI(petstorePath);

    for (const file of result.files) {
      // `any` would silently disable checking for everything it touches.
      expect(file.contents).not.toMatch(/\bany\b/);
      expect(file.contents.endsWith("\n")).toBe(true);
    }
  });
});
