/**
 * 公式引擎。
 *
 * ## 为什么是手写的
 *
 * 旧版包没有公式类型，但它在 `variableParser` 里有同一形状的问题：模板数据可信到足以驱动文档
 * 改动。公式*表达式*也是模板数据——它随客户保存的 JSON 文件一起到来——所以用 `eval` 或
 * `new Function` 来求值会让「打开一个模板」等同于「运行一个程序」。下面的词法器只接受数字、
 * 四个运算符、括号、逗号、带点的键以及 `FORMULA_FUNCTIONS` 里的名字；其他任何内容都是词法
 * 错误。从表达式到 JavaScript 求值之间没有任何路径，这是由构造方式保证的，而不是靠黑名单
 * （所以 `constructor` 就是一个普通变量名，而 `Math.constructor("x")` 会失败，因为字符串
 * 字面量不是记号）。
 *
 * ## 错误也是值
 *
 * 这里的任何东西都不会把异常抛过 API 边界：格式错误的表达式或除以零都会以
 * {@link FormulaError} 字符串的形式返回。带坏公式的模板必须仍然能打开，所以渲染永远不能
 * 依赖可能被忘记的 `try/catch`——见 `resolveVariable`，它把这个字符串变成 `VariableIssue`。
 *
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

/**
 * 一次公式失败，用填写对话框可以直接打印的语言描述。
 *
 * A formula failure, in the language a fill dialog can print.
 */
export interface FormulaError {
  /**
   * 机器可读的种类。`syntax` 同时涵盖词法器和语法分析器。
   *
   * Machine-readable kind. `syntax` covers the tokenizer and the parser alike.
   */
  code: "syntax" | "cycle" | "unknown" | "invalid";

  /**
   * 供人阅读的文本，已经可以直接用作 `VariableIssue.message`。
   *
   * Human-readable, already usable as a `VariableIssue.message`.
   */
  message: string;
}

/**
 * 一次成功的求值，或者阻止求值的那条错误。
 *
 * A successful evaluation, or the error that prevented one.
 */
export type FormulaResult =
  | { ok: true; value: number }
  | { ok: false; error: FormulaError };

/**
 * 一个表达式记号。不存在字符串或布尔字面量，所以没有任何东西可以被执行。
 *
 * One expression token. No string or boolean literal exists, so none can be executed.
 */
export type FormulaToken =
  | { kind: "number"; value: number }
  | { kind: "identifier"; name: string }
  | { kind: "operator"; op: "+" | "-" | "*" | "/" }
  | { kind: "lparen" }
  | { kind: "rparen" }
  | { kind: "comma" };

/**
 * 名称在 {@link FORMULA_FUNCTIONS} 中时返回 `true`。
 *
 * `true` for a name in {@link FORMULA_FUNCTIONS}.
 */
export function isFormulaFunction(name: string): name is FormulaFunction {
  return (FORMULA_FUNCTIONS as readonly string[]).includes(name);
}

/**
 * 词法器或语法分析器的失败。内部使用：{@link evaluateFormula} 会把它转成值。
 *
 * A tokenizer/parser failure. Internal: {@link evaluateFormula} converts it to a value.
 */
class FormulaSyntaxError extends Error {}

/**
 * 这里不涉及 ProseMirror 位置与 CJK 文本；保持消息简短而稳定。
 *
 * ProseMirror positions and CJK text are not at issue here; keep the messages short and stable.
 */
const syntaxError = (message: string): FormulaSyntaxError => new FormulaSyntaxError(message);

/**
 * 可以作为标识符开头的字符。刻意逐个列出：JS 正则里的 `\w` 反正只匹配 ASCII。
 *
 * Characters that may start an identifier. Kept explicit: `\w` in a JS regex is ASCII-only anyway.
 */
const IDENTIFIER_START = /[A-Za-z_]/;

/**
 * 标识符的后续字符，包含带点路径中的点。
 *
 * Identifier continuation, including the dot of a dotted path.
 */
const IDENTIFIER_PART = /[A-Za-z0-9_.]/;

/** 数字，或开始小数部分的点。 / Digit, or a dot that begins a fraction. */
const NUMBER_PART = /[0-9.]/;

/**
 * 把表达式变成记号序列。
 *
 * Turn an expression into tokens.
 *
 * @throws {FormulaSyntaxError} 遇到语法之外的字符或格式错误的数字时抛出 /
 *   on a character outside the grammar or a malformed number. Callers use
 *   {@link evaluateFormula} or {@link referencedKeys} instead.
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
 * 两个被接受的布尔字面量的数值含义。
 *
 * `true`/`false` 是数字之外唯一的字面量，因为布尔变量用在 `IF` 里时它们读起来好得多，而且
 * 两者都不可执行。它们是*常量*而不是变量，有三个地方必须对此保持一致：{@link referencedKeys}
 * 会略过它们（没有东西提供它们），{@link evaluateFormula} 会把它们预置进操作数映射，而
 * 解析器的裸名字分支会回退到它们。当只有解析器知道这件事时，`IF(true, 10, 20)` 会以
 * `unknown variable "true"` 失败。
 *
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
 * 表达式会读取的键。
 *
 * 它有两个用途：在求值之前解析公式的操作数，以及检测依赖环。函数名会被排除——`SUM(a)` 里的
 * `SUM` 指的是函数，绝不是变量——布尔字面量也一样，它们是常量。因此这两个集合里的名字都
 * 不可能成为环的一部分。
 *
 * 格式错误的表达式返回 `[]`：没有值得解析的东西，而且调用方已经报告了语法错误。
 *
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
 * 用已经解析好的操作数对 `formula.expression` 求值。
 *
 * Evaluate `formula.expression` against already-resolved operands.
 *
 * @param formula 存储的配置；这里只读取 `expression` /
 *   - the stored configuration; only `expression` is read here.
 * @param resolve 查找一个键。返回 `undefined` 会报告 `unknown`，由调用方决定一个缺失的键是
 *   尚未填写的变量，还是根本不存在的键 /
 *   looks a key up. Returning `undefined` reports `unknown`; the caller decides whether an
 *   absent key is a variable that has not been filled in or a key that does not exist at all.
 * @returns 数值结果，或一个 {@link FormulaError}。从不抛错 /
 *   the numeric result, or a {@link FormulaError}. Never throws.
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
 * 作用于扁平记号表的递归下降解析器。
 *
 * 解析器在任何操作数被解析*之前*就构建好，并且在该节点的每次求值中复用（`IF` 的分支只在被
 * 选中时才求值——见 {@link ExpressionParser.parsePrimary}），这就是短路求值不需要第二趟
 * AST 遍历的原因。
 *
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
   * 正在被解析的记号表。
   *
   * 声明为字段并在构造函数里赋值，而不是写成构造函数参数属性：参数属性不是可擦除语法，只做
   * 类型剥离的 TypeScript 加载器（Node 自带的那个，验证工具用的就是它）会拒绝它们。
   *
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

  /**
   * `expression` —— 整个程序，并检查是否有剩余记号。
   *
   * `expression` — the whole program, with a trailing-token check.
   */
  parseProgram(): (keys: ReadonlyMap<string, number>) => number {
    const expression = this.parseAdditive();
    if (!this.atEnd()) {
      const token = this.peek();
      throw syntaxError(`unexpected ${token ? describe(token) : "end of expression"}`);
    }
    return expression;
  }

  /**
   * `additive` —— `term (("+" | "-") term)*`，左结合。
   *
   * `additive` — `term (("+" | "-") term)*`, left-associative.
   */
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

  /**
   * `multiplicative` —— `unary (("*" | "/") unary)*`，左结合。
   *
   * `multiplicative` — `unary (("*" | "/") unary)*`, left-associative.
   */
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

  /**
   * `unary` —— `"-" unary | "+" unary | primary`，所以 `--a` 与 `-(a+b)` 都能解析。
   *
   * `unary` — `"-" unary | "+" unary | primary`, so `--a` and `-(a+b)` both parse.
   */
  private parseUnary(): (keys: ReadonlyMap<string, number>) => number {
    const operator = this.matchOperator("-", "+");
    if (operator) {
      const operand = this.parseUnary();
      return operator === "-" ? (keys) => -operand(keys) : operand;
    }
    return this.parsePrimary();
  }

  /**
   * `primary` —— 数字 | 键 | 函数调用 | `"(" expression ")"`。
   *
   * `primary` — number | key | function call | `"(" expression ")"`.
   */
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
   * 名字后面跟着 `(` 时是调用，否则是变量引用。
   *
   * 正因如此，一个变量完全可以叫 `SUM`，而 `SUM(a, b)` 仍然表示那个函数。
   *
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

  /**
   * 以逗号分隔的参数，在 `)` 之前停下。允许空列表（`SUM()`）。
   *
   * Comma-separated arguments, stopping before the `)`. An empty list is allowed (`SUM()`).
   */
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
   * 把参数列表绑定到一个函数实现上。
   *
   * 参数个数在这里、在解析时就检查，所以模板作者是在对话框里看到「ROUND() 参数数量不对」，
   * 而不是等到渲染时。
   *
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

/** 为错误信息渲染一个记号。 / Render a token for an error message. */
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
 * 把任意的填写值强制转换为公式操作数。
 *
 * `boolean` 刻意变成 `1`/`0`，而不是看起来像数字的字符串：一份存了 `"true"` 的合同不能悄悄
 * 变成 `NaN`，而 `Number("")` 是 `0`，这正是「还没有值」的合理读法。
 *
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

/**
 * 方便那些持有 `VariableFillData` 而不是解析函数的调用方。
 *
 * A convenience for callers that hold `VariableFillData` rather than a resolver function.
 */
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
 * 把一个值读成布尔值。
 *
 * 供 `boolean` 类型使用，它背后没有公式：存下来的值可能来自表单控件（真正的布尔）、来自
 * JSON（字符串）或来自数字输入框，而这三者对文档来说含义相同。`undefined` 与 `null` 读作
 * `false`，与旧版默认的「否」一致。
 *
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
