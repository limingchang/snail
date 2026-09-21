/**
 * 通过 URL 触发浏览器下载，全程不把字节读进内存。
 *
 * 常见做法是先把响应读成 `Blob`，再创建对象 URL 点击下载，但这只适合小
 * 文件：200 MB 的导出会变成 200 MB 的 `Blob`，创建对象 URL 时又复制一份，
 * 既没有进度也无法续传。本库改由服务端签发一个短期下载地址，把导航交给
 * 浏览器本身完成，于是获得浏览器自带的进度条、断点续传与流式落盘，下载
 * 也不会因为页面跳转而中断。本库只负责索取地址，然后点一下链接。
 *
 * Trigger a browser download from a URL, without ever holding the bytes.
 *
 * ## Why the library does not download for you
 *
 * The obvious design — `responseType: "blob"`, `await`, then an object URL — is
 * wrong for anything but a small file. It forces the whole payload through
 * JavaScript memory, so a 200 MB export becomes a 200 MB `Blob` plus a second copy
 * when the object URL is created, with no progress reporting and no way to resume.
 * On a slow connection the tab simply runs out of memory, and the user has no idea
 * whether anything is happening.
 *
 * The design that scales is the one every large site already uses: the server
 * mints a short-lived download URL, and the browser fetches it natively. That gives
 * you a real progress bar in the browser's own download manager, resume support,
 * streaming to disk instead of RAM, and a download that survives navigation. All
 * this library does is ask for the URL and then click a link.
 *
 * ```ts
 * @Api("/report")
 * class ReportApi {
 *   /** Ask the server to prepare the export; it answers with a temp URL. *\/
 *   @Post("/export")
 *   create(@Data() query: ReportQuery): Promise<{ url: string; filename: string }> {
 *     return null!;
 *   }
 * }
 *
 * const { url, filename } = (await reportApi.create(query).send()).data;
 * triggerDownload(url, { filename });
 * ```
 *
 * ## When you genuinely need the blob
 *
 * If the response must be transformed, or the backend cannot issue a URL, request
 * `responseType: "blob"` and use {@link triggerBlobDownload} instead — it accepts
 * an already-materialised `Blob` and takes care of revoking the object URL.
 */

/**
 * {@link triggerDownload} 接受的选项。
 *
 * Options accepted by {@link triggerDownload}.
 */
export interface TriggerDownloadOptions {
  /**
   * 建议浏览器使用的文件名。
   *
   * 跨域 `href` 会忽略它：浏览器此时只认服务端的 `Content-Disposition`，
   * 因为允许页面重命名跨域下载本身就是一个安全问题。跨域文件请让服务端
   * 在那个响应头里给出名字。
   *
   * Filename to suggest to the browser.
   *
   * A cross-origin `href` ignores this — the browser honours the server's
   * `Content-Disposition` instead, because letting a page rename a cross-origin
   * download would be a security problem. For a cross-origin file, make the server
   * send the name in that header.
   */
  filename?: string;

  /**
   * 在新标签页中打开，而不是下载。默认 `false`。
   *
   * Open in a new tab instead of downloading. Defaults to `false`.
   *
   * @defaultValue `false`
   */
  openInNewTab?: boolean;

  /**
   * 临时锚点挂载到哪个元素下。
   *
   * 只有旧版 Firefox 需要它：从未插入文档的锚点会忽略 `click()`。默认是
   * `document.body`。
   *
   * Where to attach the temporary anchor.
   *
   * Needed only for the old Firefox behaviour where an anchor that was never in the
   * document ignores `click()`. Defaults to `document.body`.
   */
  container?: HTMLElement;

  /**
   * 导航时使用的 `referrerpolicy`。
   *
   * `referrerpolicy` for the navigation.
   */
  referrerPolicy?: string;
}

/**
 * {@link triggerDownload} 成功时的返回值。
 *
 * Result of a successful {@link triggerDownload}.
 */
export interface TriggerDownloadResult {
  /**
   * 实际导航到的 URL。
   *
   * The URL that was navigated to.
   */
  url: string;

  /**
   * 请求浏览器使用的文件名；未提供时为 `undefined`。
   *
   * The filename the browser was asked to use, when one was supplied.
   */
  filename: string | undefined;
}

/**
 * 把浏览器导航到 `url`，并当作下载处理。
 *
 * 同源路径、跨域绝对地址与 `blob:` 对象 URL 都适用。没有 DOM 时直接抛错：
 * 对一个职责就是产生副作用的函数来说，静默地什么都不做是最糟的结果。
 *
 * Navigate the browser to `url` as a download.
 *
 * Works for a same-origin path, a cross-origin absolute URL and a `blob:` object
 * URL alike. Throws when there is no DOM, because silently doing nothing is the
 * worst possible outcome for a function whose entire job is a side effect.
 *
 * @param url 要下载的地址 / The url to download.
 * @param options 下载选项 / Download options.
 * @returns 实际导航到的地址与文件名 / The navigated url and filename.
 * @throws {ReferenceError} 当前运行时没有 DOM 时抛出 / Thrown when the runtime has no DOM.
 */
export function triggerDownload(
  url: string,
  options: TriggerDownloadOptions = {}
): TriggerDownloadResult {
  if (typeof document === "undefined") {
    throw new ReferenceError(
      "[snail] triggerDownload() needs a DOM. On a server, return the url to the " +
        "client and let the browser fetch it, or write the bytes with node:fs."
    );
  }

  const anchor = document.createElement("a");

  // `target="_blank"` without `rel="noopener"` hands the opened page a handle on
  // this one through `window.opener`, which is a well known tabnabbing vector.
  if (options.openInNewTab) {
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
  } else if (options.filename) {
    // `download` is what turns a navigation into a download. Setting it on a
    // cross-origin URL is ignored by the browser (see the filename note above),
    // which is why the server must send `Content-Disposition` in that case.
    anchor.download = options.filename;
  }

  if (options.referrerPolicy) anchor.referrerPolicy = options.referrerPolicy;

  anchor.href = url;
  anchor.style.display = "none";

  const container = options.container ?? document.body;
  container.appendChild(anchor);

  try {
    anchor.click();
  } finally {
    // Always detached: a hidden anchor left in the DOM leaks for the lifetime of
    // the page, and in a single-page app that is unbounded.
    anchor.remove();
  }

  return { url, filename: options.filename };
}

/**
 * 把一个已在内存中的 `Blob` 交给浏览器下载。
 *
 * 仅在字节已经拿到手时才使用。对象 URL 会在下一个宏任务中撤销，而不是立即
 * 撤销：在同一 tick 内撤销会与 Safari、Firefox 的导航竞争，下载会悄无声息
 * 地永远不开始。代价是内存中短暂多一份副本，所以 {@link triggerDownload}
 * 仍是推荐路径。
 *
 * Download an in-memory `Blob` by handing the browser an object URL.
 *
 * Use this only when the bytes are already in hand. The object URL is revoked on
 * the next macrotask rather than immediately: revoking it in the same tick races
 * the navigation in Safari and Firefox, and the download silently never starts.
 * The cost is a short-lived duplicate in memory, which is why {@link triggerDownload}
 * remains the recommended path.
 *
 * @param blob 要下载的字节 / The bytes to download.
 * @param options 下载选项 / Download options.
 * @returns 实际导航到的地址与文件名 / The navigated url and filename.
 * @throws {ReferenceError} 运行时没有 `URL.createObjectURL` 时抛出 / Thrown when the
 *   runtime provides no `URL.createObjectURL`.
 */
export function triggerBlobDownload(
  blob: Blob,
  options: TriggerDownloadOptions = {}
): TriggerDownloadResult {
  if (typeof URL === "undefined" || typeof URL.createObjectURL !== "function") {
    throw new ReferenceError(
      "[snail] triggerBlobDownload() needs URL.createObjectURL, which this runtime does not provide"
    );
  }

  const objectUrl = URL.createObjectURL(blob);

  try {
    return triggerDownload(objectUrl, options);
  } finally {
    setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  }
}

/**
 * 从 `Content-Disposition` 响应头中解析出文件名。
 *
 * 服务端给的是响应头而不是 JSON 字段，而解析它比看上去麻烦：`filename*`
 * （RFC 5987，百分号编码的 UTF-8）优先于可能带引号的 `filename`。响应头缺失
 * 或没有给出名字时返回 `undefined`，好让调用方使用自己的默认值，而不是把
 * 字面量 `"undefined"` 写到磁盘上。
 *
 * Build a filename from a `Content-Disposition` header.
 *
 * Servers send the header, not a JSON field, and parsing it is fiddlier than it
 * looks: `filename*` (RFC 5987, percent-encoded UTF-8) wins over `filename`, which
 * may itself be quoted. Returns `undefined` when the header is absent or names
 * nothing, so a caller can fall back to its own default instead of writing a
 * literal `"undefined"` to disk.
 *
 * @param header `Content-Disposition` 响应头的值 / The `Content-Disposition` value.
 * @returns 解析出的文件名；没有则为 `undefined` / The parsed filename, or `undefined`.
 */
export function filenameFromDisposition(header: string | undefined): string | undefined {
  if (!header) return undefined;

  const extended = /filename\*\s*=\s*([^;]+)/i.exec(header);
  if (extended) {
    const value = extended[1]!.trim();
    const encoded = value.includes("''") ? value.slice(value.indexOf("''") + 2) : value;
    try {
      return decodeURIComponent(encoded.replace(/^["']|["']$/g, ""));
    } catch {
      // A malformed escape is not worth failing a download over.
    }
  }

  const plain = /filename\s*=\s*("([^"]*)"|([^;]+))/i.exec(header);
  if (plain) {
    const value = (plain[2] ?? plain[3] ?? "").trim();
    if (value.length > 0) return value;
  }

  return undefined;
}
