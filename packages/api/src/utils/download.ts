/**
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

/** Options accepted by {@link triggerDownload}. */
export interface TriggerDownloadOptions {
  /**
   * Filename to suggest to the browser.
   *
   * A cross-origin `href` ignores this — the browser honours the server's
   * `Content-Disposition` instead, because letting a page rename a cross-origin
   * download would be a security problem. For a cross-origin file, make the server
   * send the name in that header.
   */
  filename?: string;

  /** Open in a new tab instead of downloading. Defaults to `false`. */
  openInNewTab?: boolean;

  /**
   * Where to attach the temporary anchor.
   *
   * Needed only for the old Firefox behaviour where an anchor that was never in the
   * document ignores `click()`. Defaults to `document.body`.
   */
  container?: HTMLElement;

  /** `referrerpolicy` for the navigation. */
  referrerPolicy?: string;
}

/** Result of a successful {@link triggerDownload}. */
export interface TriggerDownloadResult {
  /** The URL that was navigated to. */
  url: string;

  /** The filename the browser was asked to use, when one was supplied. */
  filename: string | undefined;
}

/**
 * Navigate the browser to `url` as a download.
 *
 * Works for a same-origin path, a cross-origin absolute URL and a `blob:` object
 * URL alike. Throws when there is no DOM, because silently doing nothing is the
 * worst possible outcome for a function whose entire job is a side effect.
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
 * Download an in-memory `Blob` by handing the browser an object URL.
 *
 * Use this only when the bytes are already in hand. The object URL is revoked on
 * the next macrotask rather than immediately: revoking it in the same tick races
 * the navigation in Safari and Firefox, and the download silently never starts.
 * The cost is a short-lived duplicate in memory, which is why {@link triggerDownload}
 * remains the recommended path.
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
 * Build a filename from a `Content-Disposition` header.
 *
 * Servers send the header, not a JSON field, and parsing it is fiddlier than it
 * looks: `filename*` (RFC 5987, percent-encoded UTF-8) wins over `filename`, which
 * may itself be quoted. Returns `undefined` when the header is absent or names
 * nothing, so a caller can fall back to its own default instead of writing a
 * literal `"undefined"` to disk.
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
