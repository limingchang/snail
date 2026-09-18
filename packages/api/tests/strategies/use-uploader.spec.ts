import { describe, expect, it } from "vitest";
import { Api, Data, Post } from "../../src/index";
import { useUploader } from "../../src/strategies";
import { buildServer, delay, until } from "./support";

/**
 * `useUploader`.
 *
 * What matters is the batch behaviour: the concurrency cap actually caps, one bad
 * file does not take the batch down, and the aggregate reaches `1` even when the
 * transport reports no progress at all (which is exactly what a mocked adapter
 * does).
 */

const OK = { body: { code: 0, message: "ok", data: { ok: true } } };

@Api("/files")
class FileApi {
  @Post("/upload")
  upload(@Data() form: FormData): Promise<{ ok: boolean }> {
    return null!;
  }
}

function makeFiles(count: number): File[] {
  return Array.from({ length: count }, (_, index) => new File(["x"], `f${index}.txt`));
}

describe("useUploader", () => {
  it("uploads every file while honouring concurrency", async () => {
    let inFlight = 0;
    let peak = 0;

    const { Service, test } = buildServer(async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await delay(5);
      inFlight -= 1;
      return OK;
    });

    const uploader = useUploader(Service.createApi(FileApi).upload, { concurrency: 2 });
    await uploader.upload(makeFiles(5));

    expect(test.requests).toHaveLength(5);
    expect(peak).toBeLessThanOrEqual(2);
    expect(uploader.files.value.map((entry) => entry.status)).toEqual([
      "success",
      "success",
      "success",
      "success",
      "success"
    ]);
    expect(uploader.progress.value).toBe(1);
  });

  it("writes the file into a FormData under fieldName", async () => {
    const { Service, test } = buildServer(OK);
    const uploader = useUploader(Service.createApi(FileApi).upload, { fieldName: "avatar" });

    await uploader.upload(new File(["x"], "a.txt"));

    const data = test.requests[0]!.data;
    expect(data).toBeInstanceOf(FormData);
    const sent = (data as FormData).get("avatar");
    expect((sent as File).name).toBe("a.txt");
  });

  it("keeps one bad file from aborting the others", async () => {
    let calls = 0;
    const { Service, test } = buildServer(() => {
      calls += 1;
      return calls === 2 ? { error: new Error("rejected") } : OK;
    });

    const uploader = useUploader(Service.createApi(FileApi).upload, { concurrency: 1 });
    await uploader.upload(makeFiles(3));

    expect(test.requests).toHaveLength(3);
    expect(uploader.files.value.map((entry) => entry.status)).toEqual([
      "success",
      "error",
      "success"
    ]);
    expect(uploader.files.value[1]!.error).toBeInstanceOf(Error);
    expect(uploader.error.value).toBeInstanceOf(Error);
  });

  it("re-queues one failed file on retry()", async () => {
    let calls = 0;
    const { Service, test } = buildServer(() => {
      calls += 1;
      return calls === 1 ? { error: new Error("rejected") } : OK;
    });

    const uploader = useUploader(Service.createApi(FileApi).upload, { concurrency: 1 });
    await uploader.upload(new File(["x"], "a.txt"));

    const failed = uploader.files.value[0]!;
    expect(failed.status).toBe("error");

    uploader.retry(failed.id);
    await until(() => uploader.files.value[0]!.status === "success");

    expect(test.requests).toHaveLength(2);
    expect(uploader.error.value).toBeUndefined();
  });

  it("accepts a single file when multiple is false", async () => {
    const { Service, test } = buildServer(OK);
    const uploader = useUploader(Service.createApi(FileApi).upload, { multiple: false });

    await uploader.upload(makeFiles(3));

    expect(uploader.files.value).toHaveLength(1);
    expect(test.requests).toHaveLength(1);
  });

  it("does nothing for an empty selection", async () => {
    const { Service, test } = buildServer(OK);
    const uploader = useUploader(Service.createApi(FileApi).upload);

    await uploader.upload(null);
    await uploader.upload([]);

    expect(uploader.files.value).toEqual([]);
    expect(test.requests).toHaveLength(0);
    expect(uploader.progress.value).toBe(0);
  });

  it("returns cancelled files to pending on abort()", async () => {
    const { Service } = buildServer({ delayMs: 30 });
    const uploader = useUploader(Service.createApi(FileApi).upload, { concurrency: 1 });

    const uploading = uploader.upload(makeFiles(3));
    await delay(5);
    uploader.abort();
    await uploading;

    // Nothing succeeded, nothing is reported as a failure, and the files are still
    // there to retry.
    expect(uploader.files.value.every((entry) => entry.status === "pending")).toBe(true);
    expect(uploader.error.value).toBeUndefined();
    expect(uploader.files.value.every((entry) => entry.error === undefined)).toBe(true);
  });

  it("reports aggregate progress to onProgress", async () => {
    const seen: number[] = [];
    const { Service } = buildServer(OK);
    const uploader = useUploader(Service.createApi(FileApi).upload, {
      onProgress: (state) => seen.push(state.progress)
    });

    await uploader.upload(makeFiles(2));

    expect(seen.length).toBeGreaterThan(0);
    expect(seen.at(-1)).toBe(1);
  });

  it("feeds per-file progress from the transport callback", async () => {
    const perFile: number[] = [];
    const { Service } = buildServer((request) => {
      // Stand in for a transport that reports upload progress mid-flight.
      request.config.onUploadProgress?.({
        loaded: 1,
        total: 4,
        bytes: 1,
        lengthComputable: true
      });
      request.config.onUploadProgress?.({
        loaded: 3,
        total: 4,
        bytes: 3,
        lengthComputable: true
      });
      return OK;
    });

    const uploader = useUploader(Service.createApi(FileApi).upload, {
      onProgress: (state) => perFile.push(state.files[0]?.progress ?? -1)
    });

    await uploader.upload(new File(["x"], "a.txt"));

    // The injected callback landed on the request axios actually sent, and the
    // finished file still ends at 1.
    expect(perFile).toContain(0.25);
    expect(perFile).toContain(0.75);
    expect(uploader.files.value[0]!.progress).toBe(1);
  });
});
