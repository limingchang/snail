/**
 * Render one `src/apis/<tag>.api.ts` file: one `@Api` class plus its ready instance.
 *
 * ## Why the method bodies are `return null!`
 *
 * The decorators are not executable code. `SnailServer.createApi` replaces every
 * decorated method with a factory that builds a request, so the body never runs —
 * it exists only to declare the argument list and, crucially, the **return type**:
 * `SnailPayloadOf<R>` turns `Promise<Pet>` into the response payload type. Emitting
 * a real body would suggest the body matters; `return null!` makes it obvious that
 * only the signature is load-bearing.
 *
 * ## Why the declared return type must be `Promise<…>`
 *
 * A method whose return annotation is `Pet` would set the payload type to `Pet`
 * *synchronously*, and `method.send()` — which is async — would type `data` as
 * `unknown`. The `Promise` wrapper is what `SnailPayloadOf` unwraps, so it is a
 * correctness requirement, not a style choice.
 *
 * ## Why parameters are reordered before rendering
 *
 * TypeScript rejects a required parameter after an optional one. A document may
 * declare `page` (optional) before `pathId` (required), so required arguments are
 * emitted first. Order is safe to change because every parameter carries its own
 * decorator naming the wire key — position has no meaning to the runtime.
 */

import type {
  NormalizedOperation,
  NormalizedParameter,
  OperationGroup,
  ParameterSource
} from "../openapi/operations.js";
import { renderPayloadType, withNameHint, type TypeRenderContext } from "../openapi/schema.js";
import { toTypeIdentifier } from "../utils/naming.js";
import { foreignImportSpecs } from "./type.js";
import {
  API_PACKAGE,
  renderImports,
  renderJSDoc,
  sections,
  stringLiteral,
  withDocComment,
  withHeader,
  type ImportSpec
} from "./format.js";

/** Longest signature rendered on one line; longer ones get one parameter per line. */
const MAX_INLINE_SIGNATURE = 110;

/** One rendered argument: its decorator, name, optionality and type. */
interface RenderedParameter {
  /** `@Params("petId") ` including the separating space, or `""` when undecorated. */
  prefix: string;
  name: string;
  optional: boolean;
  type: string;
}

/**
 * Which decorator renders each parameter source.
 *
 * Typed as a complete map over {@link ParameterSource} rather than a loose record: a new
 * source must make an explicit decorator decision here, instead of silently rendering an
 * undecorated argument.
 */
const DECORATOR_FOR_SOURCE: Record<ParameterSource, string | undefined> = {
  path: "Params",
  query: "Query",
  header: "HeaderValue",
  // The library exposes no cookie decorator; emitting an invented one would only
  // fail at runtime, so the argument stays in the signature and the JSDoc explains.
  cookie: undefined,
  body: "Data"
};

function renderParameter(
  parameter: NormalizedParameter,
  operation: NormalizedOperation,
  ctx: TypeRenderContext
): RenderedParameter {
  const decorated = parameter.source !== "body";
  const type = decorated
    ? renderPayloadType(
        parameter.schema,
        withNameHint(ctx, toTypeIdentifier(`${operation.operationId ?? ""}${parameter.wireName}`))
      )
    : renderBodyParameterType(parameter, operation, ctx);

  const decoratorName = DECORATOR_FOR_SOURCE[parameter.source];
  const prefix =
    decoratorName === undefined
      ? ""
      : parameter.decoratorArg === undefined
        ? `@${decoratorName}() `
        : `@${decoratorName}(${stringLiteral(parameter.decoratorArg)}) `;

  return {
    prefix,
    name: parameter.argumentName,
    optional: !parameter.required,
    type
  };
}

/**
 * The declared type of a body argument.
 *
 * A multipart body is always `FormData`, whatever the schema says: the api's
 * `@Data()` replaces the request body outright for a non-plain-object value, which is
 * exactly how a browser upload has to be sent. A form-urlencoded body keeps the
 * schema's per-field type.
 */
function renderBodyParameterType(
  parameter: NormalizedParameter,
  operation: NormalizedOperation,
  ctx: TypeRenderContext
): string {
  if (operation.body?.kind === "multipart") return "FormData";

  const hint = `${toTypeIdentifier(operation.operationId ?? `${operation.method}-${operation.path}`)}${toTypeIdentifier(parameter.wireName)}`;
  return renderPayloadType(parameter.schema, withNameHint(ctx, hint));
}

/**
 * The declared return type: every distinct 2xx payload type, or `void`.
 *
 * `void` for a `204` keeps `method.send()` honest — there is no payload to
 * destructure, and `unknown` would invite the caller to try.
 */
function renderResponseType(operation: NormalizedOperation, ctx: TypeRenderContext): string {
  const hint = toTypeIdentifier(operation.operationId ?? `${operation.method}-${operation.path}`);
  const rendered = new Set<string>();

  for (const response of operation.responses) {
    if (response.kind === "none") continue;
    if (response.kind === "text") {
      rendered.add("string");
      continue;
    }
    if (response.kind === "binary") {
      rendered.add("Blob");
      continue;
    }
    rendered.add(renderPayloadType(response.schema, withNameHint(ctx, `${hint}Response`)));
  }

  if (rendered.size === 0) return "void";
  return [...rendered].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)).join(" | ");
}

/**
 * JSDoc lines for one method.
 *
 * The path shown is the document's own path (`/pet/{petId}`), not the tag-relative one
 * used by the decorator: a reader searching for the endpoint in the OpenAPI file needs
 * the string that appears there. A cookie parameter has no decorator, so this comment is
 * the only place its existence is recorded; dropping it would make the generated
 * signature look arbitrary to whoever has to pass the value.
 */
function methodDocLines(operation: NormalizedOperation): string[] {
  const lines: string[] = [];
  if (operation.summary) lines.push(operation.summary);
  if (operation.description && operation.description !== operation.summary) {
    lines.push(operation.description);
  }
  lines.push(`${operation.method.toUpperCase()} ${operation.path}`);

  const cookies = operation.parameters.filter((parameter) => parameter.source === "cookie");
  if (cookies.length > 0) {
    lines.push(
      `Cookie 参数 ${cookies.map((parameter) => `\`${parameter.wireName}\``).join("、")}：` +
        "@snail-js/api 没有 cookie 装饰器，需要调用方自行写入请求头。"
    );
  }

  if (operation.body?.kind === "multipart") {
    const files = operation.body.fileFields;
    lines.push(
      files.length > 0
        ? `multipart/form-data 上传；文件字段：${files.map((field) => `\`${field}\``).join("、")}。`
        : "multipart/form-data 上传。"
    );
  }

  if (operation.deprecated) lines.push("@deprecated 该接口已标记为废弃。");

  return lines;
}

/**
 * Render one method, decorators and JSDoc included.
 *
 * A signature with several decorated parameters quickly exceeds the width a human can
 * scan, and a single 300-character line also makes every `git diff` of a regenerated
 * file touch the whole line. Past {@link MAX_INLINE_SIGNATURE} each parameter moves to
 * its own line.
 */
function renderMethod(
  operation: NormalizedOperation,
  methodName: string,
  methodPath: string,
  ctx: TypeRenderContext
): string {
  const rendered = operation.parameters.map((parameter) => renderParameter(parameter, operation, ctx));
  // Required first: TypeScript forbids a required parameter after an optional one.
  const ordered = [...rendered.filter((item) => !item.optional), ...rendered.filter((item) => item.optional)];

  const parts = ordered.map(
    (item) => `${item.prefix}${item.name}${item.optional ? "?" : ""}: ${item.type}`
  );

  const returnType = `Promise<${renderResponseType(operation, ctx)}>`;
  const inline = `  ${methodName}(${parts.join(", ")}): ${returnType} {`;
  const signature =
    inline.length <= MAX_INLINE_SIGNATURE || parts.length <= 1
      ? inline
      : [`  ${methodName}(`, ...parts.map((part) => `    ${part},`), `  ): ${returnType} {`].join("\n");

  const doc = renderJSDoc(methodDocLines(operation), 1);
  // The decorator goes between the comment and the signature: TSDoc must stay attached
  // to the method it describes.
  const body = withDocComment(
    doc,
    [`  @${operation.decorator}(${stringLiteral(methodPath)})`, signature, "    return null!;", "  }"].join("\n")
  );

  return body;
}

/**
 * Render one api file.
 *
 * The class-level `@Api` prefix is the longest path prefix shared by the tag's own
 * operations, which is what keeps `/pet`, `/pet/findByStatus` and `/pet/{petId}`
 * from repeating `/pet` three times — and what makes the method path of `/pet` a
 * bare `/`.
 */
export function renderApiFile(group: OperationGroup, ctx: TypeRenderContext): string {
  const decorators = new Set<string>(["Api"]);
  const methods: string[] = [];

  for (const entry of group.operations) {
    for (const parameter of entry.operation.parameters) {
      const name = DECORATOR_FOR_SOURCE[parameter.source];
      if (name !== undefined) decorators.add(name);
    }
    decorators.add(entry.operation.decorator);
    methods.push(renderMethod(entry.operation, entry.methodName, entry.methodPath, ctx));
  }

  const specs: ImportSpec[] = [
    { names: [...decorators], from: API_PACKAGE },
    ...foreignImportSpecs(ctx, new Set<string>(), "../types"),
    { names: ["service"], from: "../service" }
  ];

  const classDoc = renderJSDoc([group.description]);

  const classBlock = withDocComment(
    classDoc,
    [
      `@Api(${stringLiteral(group.apiPrefix)})`,
      `export class ${group.className} {`,
      methods.join("\n\n"),
      "}"
    ].join("\n")
  );

  const instanceBlock = withDocComment(
    renderJSDoc([`${group.className} 的即用实例，直接调用其方法即可发起请求。`]),
    `export const ${group.instanceName} = service.createApi(${group.className});`
  );

  return withHeader(sections([renderImports(specs), classBlock, instanceBlock]));
}
