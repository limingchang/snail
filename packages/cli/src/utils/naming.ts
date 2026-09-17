/**
 * Identifier and file naming helpers.
 *
 * ## Why one module owns every name
 *
 * Generated code is compared byte-for-byte between runs, and the same OpenAPI
 * fragment is named in several places at once: `operationId` → method name, tag →
 * class name and file name, schema title → type name, parameter name → argument
 * name and `@Params("…")` key. If two of those disagreed, or if two runs derived a
 * name differently, the output would drift. Everything therefore funnels through
 * the functions below.
 *
 * ## Why the sanitising is aggressive
 *
 * OpenAPI allows names TS does not: `x-request-id`, `200`, `class`, `pet.id`,
 * `{petId}`. The wire name must survive verbatim inside the decorator argument
 * (that is what the server sees) while the *argument* name must be a legal TS
 * identifier. Losing the wire name silently would produce a request that compiles
 * and 404s, so the two are always derived separately.
 */

/**
 * Reserved words that cannot be used as a binding name.
 *
 * `strict` mode adds the extra entries (`let`, `static`, `yield`, `implements`, …);
 * a generated file is compiled by the consumer's toolchain, which is strict far
 * more often than not, so the union is used unconditionally.
 */
const RESERVED_WORDS = new Set([
  "abstract", "any", "as", "asserts", "async", "await", "bigint", "boolean",
  "break", "case", "catch", "class", "const", "constructor", "continue",
  "debugger", "declare", "default", "delete", "do", "else", "enum", "export",
  "extends", "false", "finally", "for", "from", "function", "get", "global",
  "if", "implements", "import", "in", "infer", "instanceof", "interface", "is",
  "keyof", "let", "module", "namespace", "never", "new", "null", "number",
  "object", "of", "package", "private", "protected", "public", "readonly",
  "require", "return", "satisfies", "set", "static", "string", "super",
  "switch", "symbol", "this", "throw", "true", "try", "type", "typeof",
  "undefined", "unique", "unknown", "var", "void", "while", "with", "yield"
]);

/**
 * Split a name into comparable words.
 *
 * Handles the three shapes OpenAPI actually contains: `pet-store`,
 * `pet_store`, `petStore`, `PETStore` and `pet store`. Digits stay attached to
 * the word they follow (`pet2Id` → `pet2`, `Id`) so `v2User` does not become
 * `V2User` with a stray capital.
 */
export function splitWords(value: string): string[] {
  const cleaned = value.replace(/[^A-Za-z0-9]+/g, " ").trim();
  if (cleaned.length === 0) return [];

  const words: string[] = [];
  for (const chunk of cleaned.split(/\s+/)) {
    // Lower/digit followed by upper starts a new word; a run of capitals followed
    // by a lower-case letter splits before the last capital (`HTTPClient` →
    // `HTTP` + `Client`).
    for (const part of chunk.split(/(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])/)) {
      if (part.length > 0) words.push(part);
    }
  }
  return words;
}

function capitalize(word: string): string {
  if (word.length === 0) return word;
  const head = word.slice(0, 1).toUpperCase();
  const tail = word.slice(1);
  // Only lower-case an all-caps word, so `PetId` keeps its `Id` and `ID` becomes
  // `Id` instead of `ID` inside a longer identifier.
  return head + (tail === tail.toUpperCase() ? tail.toLowerCase() : tail);
}

/** `pet-store` / `petStore` / `pet_store` → `PetStore`. */
export function pascalCase(value: string): string {
  return splitWords(value).map(capitalize).join("");
}

/** `pet-store` / `PetStore` → `petStore`. */
export function camelCase(value: string): string {
  const pascal = pascalCase(value);
  if (pascal.length === 0) return "";
  return pascal.slice(0, 1).toLowerCase() + pascal.slice(1);
}

/** `PetStore` / `pet_store` → `pet-store`. Used for generated file names. */
export function kebabCase(value: string): string {
  return splitWords(value)
    .map((word) => word.toLowerCase())
    .join("-");
}

/**
 * Turn an arbitrary string into a safe lower-camel TS binding.
 *
 * A name that starts with a digit cannot be an identifier at all, and a reserved
 * word parses as a keyword; both are repaired rather than dropped, because
 * dropping a parameter would silently change the request.
 */
export function toIdentifier(value: string, fallback = "value"): string {
  let candidate = camelCase(value);
  if (candidate.length === 0) candidate = fallback;
  if (/^[0-9]/.test(candidate)) candidate = `_${candidate}`;
  if (RESERVED_WORDS.has(candidate)) candidate = `${candidate}_`;
  return candidate;
}

/** Upper-camel counterpart of {@link toIdentifier}, for type and class names. */
export function toTypeIdentifier(value: string, fallback = "Value"): string {
  let candidate = pascalCase(value);
  if (candidate.length === 0) candidate = fallback;
  if (/^[0-9]/.test(candidate)) candidate = `_${candidate}`;
  if (RESERVED_WORDS.has(candidate)) candidate = `${candidate}_`;
  return candidate;
}

/**
 * Reserve `candidate`, appending a counter until it is free.
 *
 * Two operations in one tag can share an `operationId`, and one of them must be
 * renamed — a duplicate method name is a compile error in the generated file,
 * which the user cannot fix by hand because the file is regenerated. The counter
 * is derived from the alphabetically sorted operation list, so the *same* method
 * gets the suffix on every run.
 */
export function uniqueIdentifier(candidate: string, taken: Set<string>): string {
  if (!taken.has(candidate)) {
    taken.add(candidate);
    return candidate;
  }

  let counter = 2;
  while (taken.has(`${candidate}${counter}`)) counter += 1;
  const unique = `${candidate}${counter}`;
  taken.add(unique);
  return unique;
}

/** `true` when the string can be written as a bare TS property name. */
export function isValidIdentifier(value: string): boolean {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(value) && !RESERVED_WORDS.has(value);
}

/**
 * Render an object key for use in an emitted interface.
 *
 * `"x-request-id"` must be quoted or the generated file does not parse; quoting a
 * legal identifier would be noise, so only invalid ones are quoted.
 */
export function formatPropertyKey(value: string): string {
  return isValidIdentifier(value) ? value : JSON.stringify(value);
}

/**
 * Longest path prefix shared by every path, compared **segment by segment**.
 *
 * Comparing raw strings would make `/pet` a prefix of `/pet-owner` and produce a
 * `@Api("/pet")` whose methods are `-owner`, i.e. a broken url. Segments also keep
 * the `:placeholders` intact, since `/pet/{petId}` and `/pet/{id}` share `/pet`.
 *
 * A single path has no *shared* prefix: promoting it would leave the one method at
 * `/`, which hides where the endpoint lives, so the caller gets `""`.
 */
export function longestPathPrefix(paths: readonly string[]): string {
  if (paths.length < 2) return "";

  const segmentLists = paths.map((path) => path.split("/"));
  const first = segmentLists[0] ?? [];
  let length = first.length;

  for (const segments of segmentLists.slice(1)) {
    let index = 0;
    while (index < length && index < segments.length && segments[index] === first[index]) {
      index += 1;
    }
    length = index;
  }

  // When every path is identical (`GET /pet` + `POST /pet`) the whole path *is*
  // the shared prefix and each method becomes `/`, which is exactly what the
  // class-level `@Api("/pet")` is for.
  const prefix = first.slice(0, length).join("/");
  return prefix === "" ? "" : prefix;
}
