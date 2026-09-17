/**
 * Render `src/types/<file>.ts` from the registry.
 *
 * ## Why declarations are grouped by tag
 *
 * The types a tag's methods use are the types a reader of that tag's api file needs
 * next to it, which is why `pet.api.ts` imports from `../types/pet`. Grouping is
 * decided by *first reference* while operations are rendered in sorted tag order, so
 * a shared schema such as `ApiResponse` always lands in the same file on every run
 * instead of drifting between tags.
 *
 * ## Why interfaces and type aliases are both used
 *
 * An object uses `interface` because it produces a better error message
 * (`property 'x' is missing in type 'Pet'`) and can be extended by the consumer. A
 * union, an enum union and an array alias must be `type`, because an interface cannot
 * express them. `enum` schemas always become **unions of string literals**, never a
 * TypeScript `enum`: an `enum` is a runtime value that has to be imported, cannot be
 * re-exported under `isolatedModules` as a type, and cannot represent the mixed
 * literal values JSON Schema allows.
 */

import { mergeObjectShape } from "../openapi/resolve.js";
import {
  collectProperties,
  renderAdditionalType,
  renderEnumUnion,
  renderSchemaType,
  resolveSchema,
  withNameHint,
  type TypeDeclaration,
  type TypeRenderContext
} from "../openapi/schema.js";
import { renderImports, renderJSDoc, sections, withDocComment, withHeader, INDENT, type ImportSpec } from "./format.js";

function withNull(type: string, nullable: boolean): string {
  if (!nullable || type === "null" || type === "unknown") return type;
  return `${type} | null`;
}

/** One property line of an interface body. */
function renderPropertyLines(properties: ReturnType<typeof collectProperties>): string[] {
  const lines: string[] = [];

  for (const property of properties) {
    const comment = renderJSDoc([property.description, ...property.notes], 1);
    if (comment) lines.push(comment);
    lines.push(`${INDENT}${property.key}${property.required ? "" : "?"}: ${property.type};`);
  }

  return lines;
}

/** `{ a: string; b?: number } & Rest` for shapes an interface cannot express. */
function renderObjectAliasLiteral(
  properties: ReturnType<typeof collectProperties>,
  additional: string | undefined
): string {
  const members = [
    ...properties.map(
      (property) => `${property.key}${property.required ? "" : "?"}: ${property.type}`
    ),
    ...(additional !== undefined ? [`[key: string]: ${additional}`] : [])
  ];

  return members.length > 0 ? `{ ${members.join("; ")} }` : "Record<string, unknown>";
}

/**
 * Render one declaration.
 *
 * The branch order is the precedence order: a schema that is *both* an enum and an
 * object (legal, and meaningless) renders as the enum, because that is the narrower
 * type and the one a caller can rely on.
 */
function renderDeclaration(declaration: TypeDeclaration, base: TypeRenderContext): string {
  const schema = resolveSchema(base.doc, declaration.schema) ?? {};
  const ctx = { ...base, nameHint: declaration.name, file: declaration.file };
  const comment = renderJSDoc([declaration.description ?? schema.description]);

  const typeArray = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : [];
  const nullable = schema.nullable === true || typeArray.includes("null");

  /** Every branch attaches `comment` with a single newline so TSDoc keeps working. */
  const attach = (code: string): string => withDocComment(comment, code);

  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    return attach(`export type ${declaration.name} = ${renderEnumUnion(schema.enum)};`);
  }

  if (schema.const !== undefined) {
    const literal =
      typeof schema.const === "string" ? JSON.stringify(schema.const) : renderEnumUnion([schema.const]);
    return attach(`export type ${declaration.name} = ${literal};`);
  }

  for (const keyword of ["oneOf", "anyOf"] as const) {
    const branches = schema[keyword];
    if (!Array.isArray(branches) || branches.length === 0) continue;
    const union = branches
      .map((branch, index) => renderSchemaType(branch, withNameHint(ctx, `Variant${index + 1}`)))
      .join(" | ");
    return attach(`export type ${declaration.name} = ${withNull(union, nullable)};`);
  }

  const shape = mergeObjectShape(base.doc, schema);

  if (shape.objectLike || shape.properties.length > 0) {
    const properties = collectProperties(schema, ctx);
    const additional = renderAdditionalType(shape.additional, withNameHint(ctx, "Value"));
    const opaque = shape.opaque.map((branch, index) =>
      renderSchemaType(branch, withNameHint(ctx, `Part${index + 1}`))
    );

    // An interface cannot express `| null`, nor `& Primitive`, and an index
    // signature next to declared properties only compiles when every property type
    // is assignable to the index type — which the document does not guarantee.
    // All three cases become an intersection/nullable alias instead.
    const needsAlias =
      nullable || opaque.length > 0 || (properties.length > 0 && additional !== undefined);

    if (needsAlias) {
      const literal = renderObjectAliasLiteral(properties, additional);
      return attach(
        `export type ${declaration.name} = ${withNull([literal, ...opaque].join(" & "), nullable)};`
      );
    }

    if (properties.length === 0) {
      return attach(
        `export type ${declaration.name} = ${additional ?? "Record<string, unknown>"};`
      );
    }

    const body = renderPropertyLines(properties).join("\n");
    return attach(`export interface ${declaration.name} {\n${body}\n}`);
  }

  return attach(
    `export type ${declaration.name} = ${withNull(renderSchemaType(schema, ctx), nullable)};`
  );
}

/**
 * Render the whole types file for one group, including the imports its declarations
 * need from *other* type files.
 *
 * Declarations are rendered in a growing loop rather than by iterating a snapshot:
 * rendering `Pet` registers `PetStatus`, `Category` and `Tag` as it goes, and those
 * belong in the same file. The loop terminates because the registry only grows
 * towards the finite set of schemas the document contains.
 */
export function renderTypeFile(
  declarations: readonly TypeDeclaration[],
  base: TypeRenderContext
): string {
  const rendered = new Map<string, string>();
  const queue: TypeDeclaration[] = declarations.filter((item) => item.file === base.file);

  while (queue.length > 0) {
    const declaration = queue.shift() as TypeDeclaration;
    if (rendered.has(declaration.name)) continue;
    rendered.set(declaration.name, renderDeclaration(declaration, base));

    for (const candidate of base.registry.all()) {
      if (candidate.file !== base.file) continue;
      if (rendered.has(candidate.name)) continue;
      if (queue.some((item) => item.name === candidate.name)) continue;
      queue.push(candidate);
    }
  }

  const local = new Set(rendered.keys());
  // `typesDir` is `.` here: a declaration in `types/pet.ts` imports its sibling as
  // `./default`, while `apis/pet.api.ts` imports it as `../types/default`.
  const imports = renderImports(foreignImportSpecs(base, local, "."));

  const body = [...rendered.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([, text]) => text)
    .join("\n\n");

  return withHeader(sections([imports, body]));
}

/**
 * Imports for every type this file references but does not declare.
 *
 * `verbatimModuleSyntax` makes this mandatory rather than cosmetic: a type used in a
 * signature without `import type` is a compile error in the consumer's project, and
 * the consumer cannot fix it because the file is regenerated. A shared schema such as
 * `ApiResponse` is owned by whichever tag referenced it first, so cross-file imports
 * are normal, not exceptional.
 */
export function foreignImportSpecs(
  base: TypeRenderContext,
  local: ReadonlySet<string>,
  typesDir: string
): ImportSpec[] {
  const byFile = new Map<string, string[]>();

  for (const name of base.used) {
    if (local.has(name)) continue;
    const declaration = base.registry.get(name);
    if (declaration === undefined) continue;
    const bucket = byFile.get(declaration.file);
    if (bucket) bucket.push(name);
    else byFile.set(declaration.file, [name]);
  }

  return [...byFile.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([file, names]) => ({
      names,
      from: `${typesDir}/${file}`,
      typeOnly: true
    }));
}

/**
 * Render the `src/types/index.ts` barrel.
 *
 * `export type *` is used because every file below `types/` is type-only: a plain
 * `export *` would claim to re-export runtime values that do not exist.
 */
export function renderTypesBarrelFile(files: readonly string[]): string {
  const lines = [...new Set(files)]
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .map((file) => `export type * from ${JSON.stringify(`./${file}`)};`);

  return withHeader(lines.join("\n"));
}
