/**
 * The formula engine.
 *
 * ## Why this is hand-written
 *
 * The legacy package had no formula type, but it did have the same shape of
 * problem in `variableParser`: template data was trusted enough to drive document
 * mutation. A formula *expression* is template data too — it arrives in a saved
 * JSON file from a customer — so evaluating it with `eval` or `new Function` would
 * make "open a template" equivalent to "run a program". The lexer below accepts
 * only numbers, the four operators, parentheses, commas, dotted keys and the names
 * in `FORMULA_FUNCTIONS`; anything else is a tokenizer error. There is no path from
 * an expression to a JavaScript evaluation, by construction rather than by
 * blacklisting (`constructor` is therefore an ordinary variable name, and
 * `Math.constructor("x")` fails because a string literal is not a token).
 *
 * ## Errors are values
 *
 * Nothing here throws across the API boundary: a malformed expression or a
 * division by zero comes back as a {@link FormulaError} string. A template with a
 * broken formula must still open, so rendering may never depend on a `try/catch`
 * that could be forgotten — see `resolveVariable`, which turns the string into a
 * `VariableIssue`.
 */

import type {
  FormulaFunction,
  FormulaVariableData,
  VariableFillData,
  VariableValue
} from "../../typings/variable";
import { FORMULA_FUNCTIONS } from "../../typings/variable";

/** A formula failure, in the language a fill dialog can print. */
export interface FormulaError {
  /** Machine-readable kind. `syntax` covers the tokenizer and the parser alike. */
  code: "syntax" | "cycle" | "unknown" | "invalid";

  /** Human-readable, already usable as a `VariableIssue.message`. */
  message: string;
}

/** A successful evaluation, or the error that prevented one. */
export type FormulaResult =
  | { ok: true; value: number }
  | { ok: false; error: FormulaError };

/** One expression token. No string or boolean literal exists, so none can be executed. */
export type FormulaToken =
  | { kind: "number"; value: number }
  | { kind: "identifier"; name: string }
  | { kind: "operator"; op: "+" | "-" | "*" | "/" }
  | { kind: "lparen" }
  | { kind: "rparen" }
  | { kind: "comma" };

/** `true` for a name in {@link FORMULA_FUNCTIONS}. */
export function isFormulaFunction(name: string): name is FormulaFunction {
  return (FORMULA_FUNCTIONS as readonly string[]).includes(name);
}

/** A tokenizer/parser failure. Internal: {@link evaluateFormula} converts it to a value. */
class FormulaSyntaxError extends Error {}

/** ProseMirror positions and CJK text are not at issue here; keep the messages short and stable. */
const syntaxError = (message: string): FormulaSyntaxError => new FormulaSyntaxError(message);

/** Characters that may start an identifier. Kept explicit: `\w` in a JS regex is ASCII-only anyway. */
const IDENTIFIER_START = /[A-Za-z_]/;

/** Identifier continuation, including the dot of a dotted path. */
const IDENTIFIER_PART = /[A-Za-z0-9_.]/;

/** Digit, or a dot that begins a fraction. */
const NUMBER_PART = /[0-9.]/;

/**
 * Turn an expression into tokens.
 *
 * @throws {FormulaSyntaxError} on a character outside the grammar or a malformed
 * number. Callers use {@link evaluateFormula} or {@link referencedKeys} instead.
 */
export function tokenizeExpression(expression: string): FormulaToken[] {
  const tokens: FormulaToken[] = [];
  let index = 0;

  while (index < expression.length) {
    const char = expression[index];
    if (char === undefined) break;

    // Whitespace carries no meaning; the grammar is fully parenthesised by operators.
    if (char === " " || char === "\t" || char === "\n" || char === "\r") {
      index++;
      continue;
    }

    if (NUMBER_PART.test(char)) {
      let end = index;
      let dots = 0;
      while (end < expression.length) {
        const next = expression[end];
        if (next === undefined || !NUMBER_PART.test(next)) break;
        if (next === ".") dots++;
        end++;
      }
      const raw = expression.slice(index, end);
      // `1.2.3` is a tokenizer error, not `1.2` followed by `.3`.
      if (dots > 1 || raw === ".") throw syntaxError(`invalid number "${raw}"`);
      const value = Number(raw);
      if (!Number.isFinite(value)) throw syntaxError(`invalid number "${raw}"`);
      tokens.push({ kind: "number", value });
      index = end;
      continue;
    }

    if (IDENTIFIER_START.test(char)) {
      let end = index;
      while (end < expression.length) {
        const next = expression[end];
        if (next === undefined || !IDENTIFIER_PART.test(next)) break;
        end++;
      }
      // Trim a trailing dot so `a.b.` reads as `a.b` plus a stray dot: keeping the
      // dot would make `a.b` and `a.b.` two different keys, and only one can exist.
      let name = expression.slice(index, end);
      while (name.endsWith(".")) name = name.slice(0, -1);
      if (name.length === 0) throw syntaxError("empty identifier");
      tokens.push({ kind: "identifier", name });
      index = end;
      continue;
    }

    if (char === "+" || char === "-" || char === "*" || char === "/") {
      tokens.push({ kind: "operator", op: char });
      index++;
      continue;
    }

    if (char === "(") {
      tokens.push({ kind: "lparen" });
      index++;
      continue;
    }

    if (char === ")") {
      tokens.push({ kind: "rparen" });
      index++;
      continue;
    }

    if (char === ",") {
      tokens.push({ kind: "comma" });
      index++;
      continue;
    }

    // Anything else — a quote, a brace, a semicolon, `=` — ends the parse here,
    // which is the property that keeps `eval`-style payloads inert.
    throw syntaxError(`unexpected character "${char}"`);
  }

  return tokens;
}

/**
 * The numeric meaning of the two accepted boolean literals.
 *
 * `true`/`false` are the only literals beyond numbers, because a boolean variable used
 * inside `IF` reads far better with them and neither is executable. They are *constants*,
 * not variables, and three places have to agree on that: {@link referencedKeys} omits
 * them (nothing supplies them), {@link evaluateFormula} pre-seeds them into the operand
 * map, and the parser's bare-name branch falls back to them. When only the parser knew,
 * `IF(true, 10, 20)` failed with `unknown variable "true"`.
 */
function booleanLiteral(name: string): number | undefined {
  if (name === "true") return 1;
  if (name === "false") return 0;
  return undefined;
}

/**
 * The keys an expression reads.
 *
 * Used for two things: resolving a formula's operands before evaluating it, and
 * detecting dependency cycles. Function names are excluded — `SUM` in `SUM(a)` names a
 * function, never a variable — and so are the boolean literals, which are constants. A
 * name in either set can therefore never be part of a cycle.
 *
 * A malformed expression yields `[]`: there is nothing useful to resolve, and the
 * caller already reports the syntax error.
 */
export function referencedKeys(expression: string): string[] {
  let tokens: FormulaToken[];
  try {
    tokens = tokenizeExpression(expression);
  } catch {
    return [];
  }

  const keys = new Set<string>();
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (!token || token.kind !== "identifier") continue;
    if (isFormulaFunction(token.name)) continue;
    if (booleanLiteral(token.name) !== undefined) continue;
    // `SUM(a)` must not be mistaken for a bare `SUM`; the parenthesis after a name
    // is what makes it a callee, and a callee is never an operand.
    const next = tokens[i + 1];
    if (next && next.kind === "lparen") continue;
    keys.add(token.name);
  }
  return [...keys];
}

/**
 * Evaluate `formula.expression` against already-resolved operands.
 *
 * @param formula - the stored configuration; only `expression` is read here.
 * @param resolve - looks a key up. Returning `undefined` reports `unknown`; the
 * caller decides whether an absent key is a variable that has not been filled in
 * or a key that does not exist at all.
 * @returns the numeric result, or a {@link FormulaError}. Never throws.
 */
export function evaluateFormula(
  formula: FormulaVariableData,
  resolve: (key: string) => number | undefined
): FormulaResult {
  let evaluator: (keys: ReadonlyMap<string, number>) => number;
  try {
    const tokens = tokenizeExpression(formula.expression);
    const parser = new ExpressionParser(tokens);
    evaluator = parser.parseProgram();
  } catch (error) {
    return {
      ok: false,
      error: {
        code: "syntax",
        message: error instanceof FormulaSyntaxError ? error.message : "invalid expression"
      }
    };
  }

  // Resolve every referenced key once, so a nested formula cannot re-enter and a
  // repeated key costs one lookup. `true`/`false` are seeded as constants first so the
  // parser's literal branch and this map agree.
  const values = new Map<string, number>();
  values.set("true", 1);
  values.set("false", 0);

  for (const key of referencedKeys(formula.expression)) {
    const value = resolve(key);
    if (value === undefined) {
      return { ok: false, error: { code: "unknown", message: `unknown variable "${key}"` } };
    }
    values.set(key, value);
  }

  try {
    const value = evaluator(values);
    if (!Number.isFinite(value)) {
      return { ok: false, error: { code: "invalid", message: "result is not a finite number" } };
    }
    return { ok: true, value };
  } catch (error) {
    // A syntax error at this point can only come from the evaluator itself
    // (unresolved key, division by zero), so it is reported as `invalid` unless it
    // names a missing operand.
    return {
      ok: false,
      error: {
        code: error instanceof FormulaSyntaxError && error.message.startsWith("unresolved")
          ? "unknown"
          : "invalid",
        message: error instanceof FormulaSyntaxError ? error.message : "invalid result"
      }
    };
  }
}

/**
 * A recursive-descent parser over a flat token list.
 *
 * The parser is built *before* any operand is resolved and is reused for each
 * evaluation of the node (an `IF` branch is only evaluated when it is selected —
 * see {@link ExpressionParser.parsePrimary}), which is why short-circuiting works
 * without a second AST walk.
 */
class ExpressionParser {
  private index = 0;

  /**
   * The token list being parsed.
   *
   * Declared as a field and assigned in the constructor rather than as a constructor
   * parameter property: parameter properties are not erasable syntax, so a strip-only
   * TypeScript loader (Node's own, used by the verification harness) rejects them.
   */
  private readonly tokens: readonly FormulaToken[];

  constructor(tokens: readonly FormulaToken[]) {
    this.tokens = tokens;
  }

  /** `expression` — the whole program, with a trailing-token check. */
  parseProgram(): (keys: ReadonlyMap<string, number>) => number {
    const expression = this.parseAdditive();
    if (!this.atEnd()) {
      const token = this.peek();
      throw syntaxError(`unexpected ${token ? describe(token) : "end of expression"}`);
    }
    return expression;
  }

  /** `additive` — `term (("+" | "-") term)*`, left-associative. */
  private parseAdditive(): (keys: ReadonlyMap<string, number>) => number {
    let left = this.parseMultiplicative();
    for (;;) {
      const operator = this.matchOperator("+", "-");
      if (!operator) return left;
      const right = this.parseMultiplicative();
      const previous = left;
      left = (keys) =>
        operator === "+" ? previous(keys) + right(keys) : previous(keys) - right(keys);
    }
  }

  /** `multiplicative` — `unary (("*" | "/") unary)*`, left-associative. */
  private parseMultiplicative(): (keys: ReadonlyMap<string, number>) => number {
    let left = this.parseUnary();
    for (;;) {
      const operator = this.matchOperator("*", "/");
      if (!operator) return left;
      const right = this.parseUnary();
      const previous = left;
      left = (keys) => {
        const dividend = previous(keys);
        const divisor = right(keys);
        if (operator === "/") {
          // Guarded here rather than returned as `Infinity`: an unguarded divide
          // would render "Infinity" into a contract.
          if (divisor === 0) throw syntaxError("division by zero");
          return dividend / divisor;
        }
        return dividend * divisor;
      };
    }
  }

  /** `unary` — `"-" unary | "+" unary | primary`, so `--a` and `-(a+b)` both parse. */
  private parseUnary(): (keys: ReadonlyMap<string, number>) => number {
    const operator = this.matchOperator("-", "+");
    if (operator) {
      const operand = this.parseUnary();
      return operator === "-" ? (keys) => -operand(keys) : operand;
    }
    return this.parsePrimary();
  }

  /** `primary` — number | key | function call | `"(" expression ")"`. */
  private parsePrimary(): (keys: ReadonlyMap<string, number>) => number {
    const token = this.next();
    if (!token) throw syntaxError("unexpected end of expression");

    if (token.kind === "number") {
      const value = token.value;
      return () => value;
    }

    if (token.kind === "lparen") {
      const inner = this.parseAdditive();
      this.expect("rparen", ")");
      return inner;
    }

    if (token.kind === "operator") throw syntaxError(`unexpected operator "${token.op}"`);
    if (token.kind === "identifier") return this.parseIdentifier(token.name);

    throw syntaxError(`unexpected ${describe(token)}`);
  }

  /**
   * A name is a call when a `(` follows it, and a variable reference otherwise.
   *
   * This is what lets a variable legitimately be called `SUM` while `SUM(a, b)`
   * still means the function.
   */
  private parseIdentifier(name: string): (keys: ReadonlyMap<string, number>) => number {
    const next = this.peek();
    const isCall = next !== undefined && next.kind === "lparen";

    if (!isCall) {
      const literal = booleanLiteral(name);
      if (literal !== undefined) return () => literal;
      return (keys) => {
        const value = keys.get(name);
        if (value === undefined) throw syntaxError(`unresolved variable "${name}"`);
        return value;
      };
    }

    // Validate the callee *before* parsing arguments so `FOO(1)` reports `FOO`
    // rather than whatever else happens to be wrong inside the call.
    if (!isFormulaFunction(name)) throw syntaxError(`unknown function "${name}"`);
    this.expect("lparen", "(");
    const args = this.parseArguments();
    this.expect("rparen", ")");
    return this.buildCall(name, args);
  }

  /** Comma-separated arguments, stopping before the `)`. An empty list is allowed (`SUM()`). */
  private parseArguments(): Array<(keys: ReadonlyMap<string, number>) => number> {
    const args: Array<(keys: ReadonlyMap<string, number>) => number> = [];
    const next = this.peek();
    if (next !== undefined && next.kind === "rparen") return args;

    for (;;) {
      args.push(this.parseAdditive());
      const separator = this.peek();
      if (separator !== undefined && separator.kind === "comma") {
        this.index++;
        continue;
      }
      return args;
    }
  }

  /**
   * Bind an argument list to a function implementation.
   *
   * Arity is checked here, at parse time, so a template author sees "ROUND() 参数数量不对"
   * in the dialog rather than at render time.
   */
  private buildCall(
    name: FormulaFunction,
    args: Array<(keys: ReadonlyMap<string, number>) => number>
  ): (keys: ReadonlyMap<string, number>) => number {
    const arity = (min: number, max: number): void => {
      if (args.length < min || args.length > max) {
        throw syntaxError(`${name} expects ${min === max ? String(min) : `${min}..${max}`} argument(s), got ${args.length}`);
      }
    };

    switch (name) {
      case "SUM": {
        return (keys) => args.reduce((total, argument) => total + argument(keys), 0);
      }
      case "AVG": {
        arity(1, Number.MAX_SAFE_INTEGER);
        return (keys) => {
          const total = args.reduce((sum, argument) => sum + argument(keys), 0);
          return total / args.length;
        };
      }
      case "MIN": {
        arity(1, Number.MAX_SAFE_INTEGER);
        return (keys) => Math.min(...args.map((argument) => argument(keys)));
      }
      case "MAX": {
        arity(1, Number.MAX_SAFE_INTEGER);
        return (keys) => Math.max(...args.map((argument) => argument(keys)));
      }
      case "ROUND": {
        arity(1, 2);
        return (keys) => {
          const value = args[0]?.(keys) ?? 0;
          const digits = args[1]?.(keys) ?? 0;
          // `toFixed` rounds half away from zero (`-2.5` → `-3`), which is what a
          // contract expects; `Math.round` rounds half up (`-2.5` → `-2`) and would print
          // the wrong figure for a negative amount. The clamp keeps a hostile digit count
          // (`ROUND(1, 1e9)`) from throwing a RangeError, and `Number` drops the now
          // insignificant trailing zeros so the result stays a number.
          const places = Math.min(100, Math.max(0, Math.trunc(digits)));
          return Number(value.toFixed(places));
        };
      }
      case "IF": {
        arity(3, 3);
        return (keys) => {
          // Only the selected branch is evaluated, so `IF(a, 1, 1/0)` is fine.
          const condition = args[0]?.(keys) ?? 0;
          return condition !== 0 ? args[1]?.(keys) ?? 0 : args[2]?.(keys) ?? 0;
        };
      }
      case "ABS": {
        arity(1, 1);
        return (keys) => Math.abs(args[0]?.(keys) ?? 0);
      }
      default: {
        // `satisfies never` would be the compile-time guard, but `name` is already
        // narrowed to `FormulaFunction` by the caller's check, so this branch is
        // unreachable and only exists for exhaustiveness.
        throw syntaxError(`unknown function "${name}"`);
      }
    }
  }

  private matchOperator(...candidates: Array<"+" | "-" | "*" | "/">): "+" | "-" | "*" | "/" | undefined {
    const token = this.peek();
    if (!token || token.kind !== "operator") return undefined;
    if (!candidates.includes(token.op)) return undefined;
    this.index++;
    return token.op;
  }

  private expect(kind: FormulaToken["kind"], label: string): void {
    const token = this.next();
    if (!token || token.kind !== kind) throw syntaxError(`expected "${label}"`);
  }

  private peek(): FormulaToken | undefined {
    return this.tokens[this.index];
  }

  private next(): FormulaToken | undefined {
    const token = this.tokens[this.index];
    this.index++;
    return token;
  }

  private atEnd(): boolean {
    return this.index >= this.tokens.length;
  }
}

/** Render a token for an error message. */
function describe(token: FormulaToken): string {
  switch (token.kind) {
    case "number":
      return `number "${token.value}"`;
    case "identifier":
      return `"${token.name}"`;
    case "operator":
      return `operator "${token.op}"`;
    case "lparen":
      return `"("`;
    case "rparen":
      return `")"`;
    case "comma":
      return `","`;
  }
}

/**
 * Coerce an arbitrary fill value into a formula operand.
 *
 * `boolean` is deliberately `1`/`0` rather than numeric-looking strings: a contract
 * that stores `"true"` must not silently become `NaN`, and `Number("")` is `0`,
 * which is the sane reading of "no value yet".
 */
export function toFormulaOperand(value: VariableValue): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length === 0) return 0;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

/** A convenience for callers that hold `VariableFillData` rather than a resolver function. */
export function evaluateFormulaWithFill(
  formula: FormulaVariableData,
  fill: VariableFillData
): FormulaResult {
  return evaluateFormula(formula, (key) => {
    const value = fill[key];
    return value === undefined || value === null ? undefined : toFormulaOperand(value);
  });
}

/**
 * Read a value as a boolean.
 *
 * Used by the `boolean` type, which has no formula behind it: the stored value may
 * have arrived from a form control (a real boolean), from JSON (a string) or from a
 * number input, and all three mean the same thing to the document. `undefined` and
 * `null` read as `false`, matching the legacy default of 否.
 */
export function toPlainBoolean(value: VariableValue): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalised = value.trim().toLowerCase();
    if (normalised === "" || normalised === "false" || normalised === "0" || normalised === "否") {
      return false;
    }
    return true;
  }
  return false;
}
