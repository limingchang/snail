/**
 * The formula engine.
 *
 * Two things are under test here and they are worth separating. The first is
 * arithmetic: precedence, unary minus, nesting, and each of the seven functions. The
 * second is the *boundary* — the parser accepts a small grammar and nothing else, so
 * an expression cannot become a program. `Math.constructor("x")` and `process.exit(0)`
 * are in the suite precisely because they are the shapes a blacklist would have to
 * enumerate and a grammar does not.
 */

import { describe, expect, it } from "vitest";

import {
  evaluateFormula,
  isFormulaFunction,
  referencedKeys,
  tokenizeExpression,
  toFormulaOperand,
  toPlainBoolean
} from "../../src/extensions/variable/formula";
import type { FormulaVariableData } from "../../src/typings/variable";

/** Build a formula with only the fields the evaluator reads. */
function formula(expression: string): FormulaVariableData {
  return { type: "formula", expression };
}

/** Evaluate against a plain number map, failing the test if the expression did not evaluate. */
function value(expression: string, variables: Record<string, number> = {}): number {
  const result = evaluateFormula(formula(expression), (key) => variables[key]);
  if (!result.ok) throw new Error(`expected a value, got ${result.error.code}: ${result.error.message}`);
  return result.value;
}

/** The error code an expression produces, failing the test if it produced a value. */
function errorCode(expression: string, variables: Record<string, number> = {}): string {
  const result = evaluateFormula(formula(expression), (key) => variables[key]);
  if (result.ok) throw new Error(`expected an error, got ${result.value}`);
  return result.error.code;
}

describe("arithmetic", () => {
  it("applies the conventional precedence", () => {
    expect(value("1 + 2 * 3")).toBe(7);
    expect(value("2 * 3 + 1")).toBe(7);
    expect(value("2 + 10 / 5")).toBe(4);
  });

  it("treats * and / as left-associative", () => {
    // `8 / 4 / 2` is `(8 / 4) / 2` = 1, not `8 / (4 / 2)` = 4.
    expect(value("8 / 4 / 2")).toBe(1);
    expect(value("10 - 3 - 2")).toBe(5);
  });

  it("reads a decimal and a bare integer alike", () => {
    expect(value("10.5 + 0.25")).toBe(10.75);
    expect(value("3")).toBe(3);
  });

  it("resolves nested parentheses", () => {
    expect(value("((1 + 2) * (3 + 4))")).toBe(21);
    expect(value("2 * (3 + (4 - 1))")).toBe(12);
  });

  it("applies unary minus, including doubled", () => {
    expect(value("-5")).toBe(-5);
    expect(value("--5")).toBe(5);
    expect(value("-(2 + 3)")).toBe(-5);
    expect(value("10 + -2")).toBe(8);
    expect(value("3 * -2")).toBe(-6);
  });

  it("allows insignificant whitespace", () => {
    expect(value("  1+  2 *\n3  ")).toBe(7);
  });

  it("rejects a division by zero rather than producing Infinity", () => {
    expect(errorCode("1 / 0")).toBe("invalid");
    expect(errorCode("1 / (2 - 2)")).toBe("invalid");
  });
});

describe("variables", () => {
  it("resolves a bare key", () => {
    expect(value("price", { price: 12.5 })).toBe(12.5);
  });

  it("resolves a dotted key as one name, not a path walk", () => {
    // The key is `item1.price`; nothing splits it on the dot.
    expect(value("item1.price * 2", { "item1.price": 3 })).toBe(6);
    expect(value("SUM(item1.price, item2.price)", { "item1.price": 1, "item2.price": 2 })).toBe(3);
  });

  it("reports a key nothing supplies as unknown", () => {
    expect(errorCode("missing + 1")).toBe("unknown");
  });

  it("reads true and false as 1 and 0", () => {
    expect(value("IF(true, 10, 20)")).toBe(10);
    expect(value("IF(false, 10, 20)")).toBe(20);
  });

  it("reserves a function name as the callee of a call", () => {
    // `SUM(a)` is the function, so `SUM` is not an operand there. Function names are
    // reserved outright: a bare `SUM` is skipped by `referencedKeys`, so a variable key
    // must not collide with one of the seven names. That is the cost of a fixed function
    // table over `eval`.
    expect(referencedKeys("SUM(a)")).toEqual(["a"]);
    expect(referencedKeys("SUM(a) + SUM")).toEqual(["a"]);
  });

  it("treats true and false as constants, not as keys nothing could supply", () => {
    // They are seeded into the operand map, so the parser's literal branch is never the
    // only thing that knows about them.
    expect(referencedKeys("IF(true, a, false)")).toEqual(["a"]);
    expect(value("IF(true, 10, 20)")).toBe(10);
    expect(value("IF(false, a, 20)", { a: 1 })).toBe(20);
  });
});

describe("functions", () => {
  it("SUM adds every argument and tolerates none", () => {
    expect(value("SUM(1, 2, 3)")).toBe(6);
    expect(value("SUM()")).toBe(0);
    expect(value("SUM(item1, item2) * 1.06", { item1: 100, item2: 200 })).toBeCloseTo(318, 10);
  });

  it("AVG divides by the argument count", () => {
    expect(value("AVG(1, 2, 3, 4)")).toBe(2.5);
  });

  it("MIN and MAX pick an extreme", () => {
    expect(value("MIN(5, 2, 9)")).toBe(2);
    expect(value("MAX(5, 2, 9)")).toBe(9);
    expect(value("MAX(1)")).toBe(1);
  });

  it("ROUND takes an optional digit count, defaulting to whole numbers", () => {
    expect(value("ROUND(2.4)")).toBe(2);
    expect(value("ROUND(2.5)")).toBe(3);
    expect(value("ROUND(2.3456, 2)")).toBe(2.35);
    // Half away from zero, not half up: a negative amount must not round towards zero.
    expect(value("ROUND(-2.5)")).toBe(-3);
  });

  it("IF evaluates only the selected branch", () => {
    // If both branches were evaluated eagerly, the division by zero would surface.
    expect(value("IF(1, 10, 1 / 0)")).toBe(10);
    expect(value("IF(0, 1 / 0, 20)")).toBe(20);
  });

  it("ABS drops the sign", () => {
    expect(value("ABS(-7)")).toBe(7);
    expect(value("ABS(7)")).toBe(7);
  });

  it("nests calls", () => {
    expect(value("MAX(SUM(1, 2), ABS(-5))")).toBe(5);
  });

  it("rejects a function with the wrong arity", () => {
    expect(errorCode("ABS(1, 2)")).toBe("syntax");
    expect(errorCode("IF(1, 2)")).toBe("syntax");
    expect(errorCode("AVG()")).toBe("syntax");
  });
});

describe("rejections", () => {
  it("reports an unknown function name", () => {
    expect(errorCode("TOTAL(1, 2)")).toBe("syntax");
  });

  it("reports a syntax error for an unbalanced parenthesis", () => {
    expect(errorCode("(1 + 2")).toBe("syntax");
    expect(errorCode("1 + 2)")).toBe("syntax");
  });

  it("reports a syntax error for a dangling operator", () => {
    expect(errorCode("1 +")).toBe("syntax");
    expect(errorCode("* 2")).toBe("syntax");
  });

  it("reports a malformed number", () => {
    expect(errorCode("1.2.3")).toBe("syntax");
    expect(errorCode(".")).toBe("syntax");
  });

  it("rejects every character outside the grammar", () => {
    // Each of these would be needed to smuggle an executable payload in: a string
    // literal, a statement separator, a property write, a template literal.
    for (const expression of ['"alert(1)"', "1; 2", "a = 2", "[1,2]", "{a: 1}", "`x`", "1 & 2", "a?.b"]) {
      expect(errorCode(expression), expression).toBe("syntax");
    }
  });

  it("refuses to treat a constructor call as JavaScript", () => {
    // The classic escape from a naive `new Function` sandbox. It fails at the string
    // literal, so no part of it can be evaluated as code.
    expect(errorCode('Math.constructor("alert(1)")()')).toBe("syntax");
    expect(errorCode("constructor.constructor('return 1')()")).toBe("syntax");
  });

  it("refuses a host-object escape", () => {
    // `process` parses as an ordinary variable name — which is correct, since a
    // contract may legitimately key a variable `process`. What cannot happen is
    // reaching anything through it: `exit` is not a function, and the call fails.
    expect(errorCode("process.exit(0)")).toBe("syntax");
    expect(errorCode("globalThis")).toBe("unknown");
  });

  it("never throws, whatever the expression", () => {
    const hostile = ["", " ", "(", ")", "((((", "1/0/0", "\u0000", "1e999", "-".repeat(50) + "1"];
    for (const expression of hostile) {
      expect(() => evaluateFormula(formula(expression), () => 1), expression).not.toThrow();
    }
  });
});

describe("tokenizer", () => {
  it("reads a dotted identifier as one token", () => {
    expect(tokenizeExpression("item1.price")).toEqual([{ kind: "identifier", name: "item1.price" }]);
  });

  it("trims a trailing dot so a key has one spelling", () => {
    expect(tokenizeExpression("a.b.")).toEqual([{ kind: "identifier", name: "a.b" }]);
  });
});

describe("referencedKeys", () => {
  it("lists the keys an expression reads", () => {
    expect(referencedKeys("a + b.c * 2")).toEqual(["a", "b.c"]);
  });

  it("excludes the callee of a function call", () => {
    expect(referencedKeys("SUM(a, MAX(b, c))")).toEqual(["a", "b", "c"]);
  });

  it("ignores a malformed expression, which the caller already reports", () => {
    expect(referencedKeys("1 +")).toEqual([]);
    expect(referencedKeys('"x"')).toEqual([]);
  });

  it("does not repeat a key read twice", () => {
    expect(referencedKeys("a + a")).toEqual(["a"]);
  });
});

describe("coercion", () => {
  it("reads a numeric string, and an empty one as zero", () => {
    expect(toFormulaOperand("12.5")).toBe(12.5);
    expect(toFormulaOperand("")).toBe(0);
    expect(toFormulaOperand("  ")).toBe(0);
    expect(toFormulaOperand("abc")).toBe(0);
  });

  it("reads a boolean as 1 or 0", () => {
    expect(toFormulaOperand(true)).toBe(1);
    expect(toFormulaOperand(false)).toBe(0);
  });

  it("reads a boolean's words", () => {
    expect(toPlainBoolean(true)).toBe(true);
    expect(toPlainBoolean("true")).toBe(true);
    expect(toPlainBoolean("是")).toBe(true);
    expect(toPlainBoolean("false")).toBe(false);
    expect(toPlainBoolean("否")).toBe(false);
    expect(toPlainBoolean(0)).toBe(false);
    expect(toPlainBoolean(1)).toBe(true);
    expect(toPlainBoolean(undefined)).toBe(false);
  });

  it("recognises exactly the declared function names", () => {
    expect(isFormulaFunction("SUM")).toBe(true);
    expect(isFormulaFunction("sum")).toBe(false);
    expect(isFormulaFunction("TOTAL")).toBe(false);
  });
});

describe("determinism", () => {
  it("returns the same value for the same input", () => {
    const first = evaluateFormula(formula("SUM(a, b) / 2"), (key) => (key === "a" ? 1 : 3));
    const second = evaluateFormula(formula("SUM(a, b) / 2"), (key) => (key === "a" ? 1 : 3));
    expect(first).toEqual(second);
  });
});
