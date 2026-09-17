/**
 * Verify the published artifacts.
 *
 * Runs against `dist/` through the package's own `exports` map (Node supports
 * self-referencing a package by name), so it catches the failure modes a unit
 * test cannot:
 *
 *   - an `exports` subpath pointing at a file that was never emitted
 *   - a bundle that does not execute under Node's native ESM resolver
 *   - a decorator-application regression in the emitted JavaScript
 *
 * Decorators are applied by calling the decorator factories directly — exactly
 * what `tsc` emits — because a plain `.mjs` file cannot carry decorator syntax.
 *
 * Run after `pnpm build`: `node ./scripts/verify-dist.mjs`
 */
import assert from "node:assert/strict";

/** Every published subpath, and a symbol that must exist on it. */
const SUBPATHS = [
  ["@snail-js/api", "SnailServer"],
  ["@snail-js/api", "Server"],
  ["@snail-js/api", "Api"],
  ["@snail-js/api", "Get"],
  ["@snail-js/api", "Params"],
  ["@snail-js/api", "Query"],
  ["@snail-js/api", "Data"],
  ["@snail-js/api", "HeaderValue"],
  ["@snail-js/api", "Header"],
  ["@snail-js/api", "Sse"],
  ["@snail-js/api", "WebSocket"],
  ["@snail-js/api", "HttpStream"],
  ["@snail-js/api", "SnailError"],
  ["@snail-js/api", "createPlugin"],
  ["@snail-js/api", "setLocale"],
  ["@snail-js/api", "triggerDownload"],
  ["@snail-js/api/plugins", "Cache"],
  ["@snail-js/api/plugins", "Cacheable"],
  ["@snail-js/api/plugins", "Interceptor"],
  ["@snail-js/api/plugins", "Versioning"],
  ["@snail-js/api/plugins", "Validate"],
  ["@snail-js/api/plugins", "Transform"],
  ["@snail-js/api/plugins", "RequestPool"],
  ["@snail-js/api/plugins", "SnailPoolError"],
  ["@snail-js/api/plugins/vue", "VueAdapter"],
  ["@snail-js/api/plugins/react", "ReactAdapter"],
  ["@snail-js/api/strategies", "useRequest"],
  ["@snail-js/api/strategies", "usePagination"],
  ["@snail-js/api/strategies/plain", "useRequest"],
  ["@snail-js/api/strategies/plain", "useDownload"],
  ["@snail-js/api/strategies/react", "useRequest"]
];

const failures = [];
let checks = 0;

for (const [specifier, symbol] of SUBPATHS) {
  try {
    const module = await import(specifier);
    assert.ok(
      symbol in module,
      `${specifier} does not export "${symbol}" (got: ${Object.keys(module).slice(0, 12).join(", ")}…)`
    );
    checks += 1;
  } catch (error) {
    failures.push(`${specifier} → ${symbol}: ${error.message}`);
  }
}

// ── a real request through the built bundle ──────────────────────────────────

const {
  Api,
  Data,
  Get,
  Params,
  Post,
  Query,
  Server,
  SnailServer,
  SnailResponseError
} = await import("@snail-js/api");

const seen = [];

const adapter = async (config) => {
  seen.push({
    url: config.url,
    baseURL: config.baseURL,
    method: String(config.method).toUpperCase(),
    params: config.params,
    data: config.data
  });

  const body =
    config.url === "/user/missing"
      ? { code: 404, message: "gone", data: null }
      : { code: 0, message: "ok", data: { id: 7, name: "ada" } };

  return {
    data: body,
    status: 200,
    statusText: "OK",
    headers: { "content-type": "application/json" },
    config
  };
};

class BackEnd extends SnailServer {}
Server({ baseURL: "/api", adapter })(BackEnd);
const service = new BackEnd();

class UserApi {
  getUser(id, withProfile) {}
  createUser(payload) {}
}
Api("/user")(UserApi);
// Evaluated bottom-up, exactly like the emitted `__decorate` helper.
Query("withProfile")(UserApi.prototype, "getUser", 1);
Params("id")(UserApi.prototype, "getUser", 0);
Get("/:id")(UserApi.prototype, "getUser");

Data()(UserApi.prototype, "createUser", 0);
Post("/")(UserApi.prototype, "createUser");

const userApi = service.createApi(UserApi);

const result = await userApi.getUser("42", true).send();
assert.equal(seen.length, 1, "exactly one request should have been recorded");
assert.equal(seen[0].url, "/user/42", "path placeholder should be substituted");
assert.equal(seen[0].baseURL, "/api");
assert.deepEqual(seen[0].params, { withProfile: true });
assert.deepEqual(result.data, { id: 7, name: "ada" });
assert.equal(result.code, 0);
assert.equal(result.fromCache, false);
checks += 1;

const created = await userApi.createUser({ name: "grace" }).send();
assert.equal(seen[1].method, "POST", "the second fixture method is a POST");
assert.equal(seen[1].url, "/user/");
assert.equal(seen[1].data, '{"name":"grace"}', "axios serialises the object body");
assert.equal(created.message, "ok");
checks += 1;

// A rejected business code must reject with the exported error class.
await assert.rejects(
  () => userApi.getUser("missing").send(),
  (error) => error instanceof SnailResponseError && error.businessCode === 404
);
checks += 1;

// ── optional peer dependencies must stay optional ────────────────────────────

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, normalize } from "node:path";

const distDir = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");

/**
 * Every bare (non-relative) module specifier reachable from a built entry.
 *
 * The walk matters: an entry usually imports a shared chunk rather than the
 * framework directly, so reading only `plugins/vue/index.js` would report no
 * `vue` import at all and the check would silently pass on a broken build.
 */
async function reachableBareImports(entry) {
  const visited = new Set();
  const bare = new Set();
  const queue = [entry.replace(/\\/g, "/")];

  while (queue.length > 0) {
    const file = queue.shift();
    if (visited.has(file)) continue;
    visited.add(file);

    let source;
    try {
      source = await readFile(join(distDir, file), "utf8");
    } catch {
      continue;
    }

    for (const pattern of [
      /(?:^|\n)\s*(?:import|export)\s[^;\n]*?from\s*["']([^"']+)["']/g,
      /(?:^|\n)\s*import\s*["']([^"']+)["']/g
    ]) {
      for (const match of source.matchAll(pattern)) {
        const specifier = match[1];
        if (specifier.startsWith(".")) {
          queue.push(normalize(join(dirname(file), specifier)).replace(/\\/g, "/"));
        } else {
          const [first, second] = specifier.split("/");
          bare.add(first.startsWith("@") ? `${first}/${second}` : first);
        }
      }
    }
  }

  return bare;
}

/**
 * Assert exactly which optional peers an entry may pull in.
 *
 * This is a packaging invariant no unit test can observe. If the `plugins` barrel
 * ever re-exported the framework adapters again, it would statically reach both
 * `vue` and `react` — and an application that only wanted `Cache` would fail to
 * resolve them at all. The split only holds while the bundles stay split.
 */
async function assertPeers(entry, { requires = [], forbids = [] }) {
  const bare = await reachableBareImports(entry);

  for (const framework of requires) {
    assert.ok(bare.has(framework), `${entry} should reach "${framework}" but does not`);
  }
  for (const framework of forbids) {
    assert.ok(!bare.has(framework), `${entry} must not reach "${framework}" but does`);
  }

  checks += 1;
}

await assertPeers("plugins/index.js", { forbids: ["vue", "react", "zod"] });
await assertPeers("plugins/vue/index.js", { requires: ["vue"], forbids: ["react"] });
await assertPeers("plugins/react/index.js", { requires: ["react"], forbids: ["vue"] });
await assertPeers("strategies/index.js", { requires: ["vue"] });
await assertPeers("strategies/plain.js", { forbids: ["vue", "react"] });
await assertPeers("strategies/react.js", { requires: ["react"] });
await assertPeers("index.js", { requires: ["axios"], forbids: ["vue", "react", "zod"] });

// ── server-side support ──────────────────────────────────────────────────────

// This process is Node, so the absence of these globals is the premise of the
// whole block: everything below runs with no DOM at all.
assert.equal(typeof document, "undefined", "this check must run without a DOM");
assert.equal(typeof window, "undefined", "this check must run without a DOM");
checks += 1;

const { Cache, Cacheable, Interceptor, RequestPool } = await import("@snail-js/api/plugins");
const { useRequest } = await import("@snail-js/api/strategies/plain");
const { triggerDownload } = await import("@snail-js/api");

{
  const seenServer = [];
  const serverAdapter = async (config) => {
    seenServer.push(String(config.url));
    return {
      data: { code: 0, message: "ok", data: { id: 1 } },
      status: 200,
      statusText: "OK",
      headers: {},
      config
    };
  };

  class ServerBackEnd extends SnailServer {}
  Server({ baseURL: "/api", adapter: serverAdapter })(ServerBackEnd);
  const server = new ServerBackEnd();

  // The whole plugin stack must install and run without touching the DOM.
  server.use(Interceptor()).use(Cache({ ttl: 60 })).use(RequestPool({ concurrency: 2 }));

  class ServerApi {
    get() {}
  }
  Api("/thing")(ServerApi);
  Cacheable()(ServerApi.prototype, "get");
  Get("/")(ServerApi.prototype, "get");

  const api = server.createApi(ServerApi);
  const cold = await api.get().send();
  const warm = await api.get().send();

  assert.deepEqual(cold.data, { id: 1 });
  assert.equal(cold.fromCache, false);
  assert.equal(warm.fromCache, true, "the cache must serve the second call with no network");
  assert.deepEqual(seenServer, ["/thing/"], "only one request should reach the adapter");
  checks += 1;

  // A strategy must run on the server too — the plain entry exists for exactly this.
  const { data, loading, error, send } = useRequest(api.get);
  await send();
  assert.deepEqual(data.value, { id: 1 });
  assert.equal(loading.value, false);
  assert.equal(error.value, undefined);
  checks += 1;
}

// The one capability that genuinely needs a browser must fail loudly, not silently.
assert.throws(
  () => triggerDownload("/tmp/x"),
  (error) => error instanceof ReferenceError && /needs a DOM/.test(error.message),
  "triggerDownload must throw a clear error on a server"
);
checks += 1;

// ── report ───────────────────────────────────────────────────────────────────

if (failures.length > 0) {
  console.error(`\n[snail] dist verification FAILED (${failures.length}):`);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  process.exit(1);
}

console.log(
  `[snail] dist verification passed — ${checks} checks across ${SUBPATHS.length} subpath exports`
);
