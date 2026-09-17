import type {
  AxiosAdapter,
  AxiosResponse,
  InternalAxiosRequestConfig
} from "axios";

/** One request captured by {@link createTestAdapter}. */
export interface RecordedRequest {
  url: string;
  method: string;
  baseURL: string | undefined;
  params: unknown;
  data: unknown;
  headers: Record<string, unknown>;
  timeout: number | undefined;
  config: InternalAxiosRequestConfig;
}

/** Canned reply description accepted by the test adapter. */
export interface TestReply {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
  /** Throw instead of replying — used to exercise the failure path. */
  error?: unknown;
  /** Delay before replying, for abort tests. */
  delayMs?: number;
}

/**
 * A recording axios adapter.
 *
 * Testing against a real adapter function (rather than stubbing axios itself)
 * keeps the whole axios request path — header normalisation, `params` handling,
 * the `transformRequest`/`transformResponse` pair — inside the test, so a bug in
 * how this library builds a config is actually observable.
 */
export function createTestAdapter(
  reply: TestReply | ((request: RecordedRequest) => TestReply | Promise<TestReply>) = {}
): { adapter: AxiosAdapter; requests: RecordedRequest[]; reset(): void } {
  const requests: RecordedRequest[] = [];

  const adapter: AxiosAdapter = async (config) => {
    const recorded: RecordedRequest = {
      url: config.url ?? "",
      method: String(config.method ?? "get").toUpperCase(),
      baseURL: config.baseURL,
      params: config.params,
      data: config.data,
      headers: normaliseHeaders(config.headers),
      timeout: config.timeout,
      config
    };
    requests.push(recorded);

    const resolved =
      typeof reply === "function" ? await reply(recorded) : reply;

    if (resolved.delayMs) {
      await new Promise((resolve) => setTimeout(resolve, resolved.delayMs));
    }

    if (resolved.error) throw resolved.error;

    return {
      data: resolved.body ?? { code: 0, message: "ok", data: null },
      status: resolved.status ?? 200,
      statusText: resolved.status === undefined || resolved.status === 200 ? "OK" : "Error",
      headers: resolved.headers ?? { "content-type": "application/json" },
      config
    } satisfies AxiosResponse;
  };

  return {
    adapter,
    requests,
    reset() {
      requests.length = 0;
    }
  };
}

function normaliseHeaders(headers: unknown): Record<string, unknown> {
  if (!headers) return {};
  if (typeof (headers as { toJSON?: () => Record<string, unknown> }).toJSON === "function") {
    return (headers as { toJSON: () => Record<string, unknown> }).toJSON();
  }
  return { ...(headers as Record<string, unknown>) };
}
