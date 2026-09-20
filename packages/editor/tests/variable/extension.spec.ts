/**
 * The node extension's schema declaration, commands and HTML encoding.
 *
 * The parts that need a real ProseMirror view — caret behaviour, the atom's
 * `stopEvent`, the node view's repaint — cannot be tested in the Node environment this
 * suite runs in (there is deliberately no jsdom: a fake DOM would assert a fiction
 * rather than the behaviour). What *is* testable here is the contract every other
 * package depends on: the declaration that makes the node an atom, the command surface
 * the toolbar calls, and the defaults the dialogs open with.
 */

import { describe, expect, it } from "vitest";

import { Variable } from "../../src/extensions/variable/index";
import { VARIABLE_TYPES } from "../../src/typings/variable";

/** The extension's configuration, reached without constructing an editor. */
function config(): Record<string, unknown> {
  return Variable.config as unknown as Record<string, unknown>;
}

/** Call one of the config's factory functions with the extension as `this`. */
function call<T>(name: string): T {
  const factory = config()[name];
  if (typeof factory !== "function") throw new Error(`the extension declares no ${name}`);
  return (factory as () => T).call(Variable);
}

describe("schema declaration", () => {
  it("is named for the node type the document refers to", () => {
    expect(Variable.name).toBe("variable");
  });

  it("is an inline atom, which is the fix for defect 24", () => {
    const configuration = config();
    expect(configuration.inline).toBe(true);
    expect(configuration.group).toBe("inline");
    // `atom: true` means the node has no content at all, so a caret cannot be parked
    // inside it, Backspace cannot delete hidden content, and the fill renderer can never
    // mistake it for a container.
    expect(configuration.atom).toBe(true);
  });

  it("is selectable but not draggable", () => {
    const configuration = config();
    expect(configuration.selectable).toBe(true);
    // Dragging a signature variable out of its clause is never what the user meant.
    expect(configuration.draggable).toBe(false);
  });
});

describe("attributes", () => {
  const attributes = call<Record<string, { default?: unknown }>>("addAttributes");

  it("declares all six, so the JSON keeps everything", () => {
    expect(Object.keys(attributes).sort()).toEqual(
      ["data", "defaultValue", "desc", "key", "keySource", "label"].sort()
    );
  });

  it("defaults the label and key the way the design dialog expects", () => {
    expect(attributes.label?.default).toBe("新变量");
    expect(attributes.key?.default).toBe("key");
  });

  it("defaults to an unspecified description, default value and manual key source", () => {
    // `undefined` rather than `""`: an untouched description must add no `data-*`
    // attribute to exported HTML, and it must not read back as an empty note.
    expect(attributes.desc?.default).toBeUndefined();
    expect(attributes.defaultValue?.default).toBeUndefined();
    expect(attributes.keySource?.default).toBe("manual");
  });

  it("defaults the configuration to a text variable, the general case", () => {
    expect(attributes.data?.default).toEqual({ type: "text" });
  });
});

describe("options and storage", () => {
  it("starts in design mode with no fill data", () => {
    const options = call<Record<string, unknown>>("addOptions");
    expect(options.mode).toBe("design");
    expect(options.values).toEqual({});
    expect(options.innerVariable).toEqual([]);
    expect(options.onRequestEdit).toBeUndefined();
  });

  it("ships a complete Chinese locale table, so the extension never renders a raw key", () => {
    const options = call<{ locale: Record<string, string> }>("addOptions");
    for (const [name, message] of Object.entries(options.locale)) {
      expect(typeof message, name).toBe("string");
      expect(message.length, name).toBeGreaterThan(0);
    }
  });

  it("declares storage that matches the options, so a consumer needs no cast", () => {
    const storage = call<Record<string, unknown>>("addStorage");
    expect(storage.mode).toBe("design");
    expect(storage.values).toEqual({});
    // A real store from the first moment it can be read, replaced by `onCreate` with
    // the one wired to the editor.
    expect(storage.store).toBeDefined();
  });
});

describe("commands", () => {
  const commands = call<Record<string, unknown>>("addCommands");

  it("declares exactly the four the UI depends on", () => {
    expect(Object.keys(commands).sort()).toEqual(
      ["getVariables", "insertVariable", "removeVariable", "updateVariable"].sort()
    );
  });

  it("returns a function per command, so Tiptap can bind them", () => {
    for (const [name, command] of Object.entries(commands)) {
      expect(typeof command, name).toBe("function");
    }
  });
});

describe("types", () => {
  it("declares a parse rule for the element it renders", () => {
    const rules = call<Array<{ tag: string; getAttrs?: unknown }>>("parseHTML");
    expect(rules).toHaveLength(1);
    expect(rules[0]?.tag).toBe("span");
    expect(typeof rules[0]?.getAttrs).toBe("function");
  });

  it("declares a node view, so the two modes are painted rather than written", () => {
    expect(typeof config().addNodeView).toBe("function");
  });

  it("keeps the union's nine types reachable from the extension's own module", () => {
    expect(VARIABLE_TYPES).toHaveLength(9);
  });
});
