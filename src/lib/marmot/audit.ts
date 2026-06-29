import type {
  AuditRecorder,
  MarmotAuditEvent,
} from "@internet-privacy/marmot-ts/audit";

/** Reported as the audit `app_version` and the `X-Goggles-App-Version` header. */
export const APP_VERSION = "marmot-web/0.0.0";

/**
 * The IPF/Marmot Goggles tracker — the default audit upload target. Account
 * identity is never sent here; it lives in the JSONL rows (`account_ref` on
 * every row plus a `source_context` row written when recording opens).
 */
export const DEFAULT_GOGGLES_ENDPOINT = "https://goggles.ipf.dev/";

/**
 * The Goggles tracker accepts a single audit file up to 64 MiB, matching the
 * reference app's `post_audit_log_file` validation.
 */
const MAX_AUDIT_UPLOAD_BYTES = 64 * 1024 * 1024;

/** An audit log file name must be `audit-*.jsonl`. */
const AUDIT_FILE_NAME = /^audit-.*\.jsonl$/;

function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex;
}

function supportsOpfs(): boolean {
  return typeof navigator !== "undefined" && !!navigator.storage?.getDirectory;
}

/**
 * A stable per-device identifier, persisted in localStorage so the same browser
 * profile reuses it across reloads. Feeds the audit `engine_id` (so two devices
 * under one account produce distinct engines) and the audit file name.
 */
export function getDeviceId(): string {
  const KEY = "marmot-device-id";
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
    localStorage.setItem(KEY, id);
  }
  return id;
}

/**
 * A browser {@link AuditRecorder} that buffers JSONL lines in memory — the
 * source of truth for {@link readNdjson} uploads — and best-effort persists the
 * whole buffer to an OPFS file so a forensic log survives a page reload. The
 * in-memory buffer is rehydrated from that file on {@link open}, so an upload
 * after a reload still ships the earlier session's events. When OPFS is
 * unavailable the recorder degrades to memory-only (lost on reload), which is
 * enough to upload the current session on demand.
 *
 * Each `record` rewrites `seq` with a recorder-level counter so the file stays
 * monotonically ordered even though the library and our setup code emit through
 * separate {@link AuditEmitter}s with independent sequences.
 */
export class BrowserAuditRecorder implements AuditRecorder {
  readonly fileName: string;
  #lines: string[] = [];
  #seq = 0;
  #closed = false;
  #handle: FileSystemFileHandle | null;
  #writeChain: Promise<void> = Promise.resolve();
  #flushTimer: ReturnType<typeof setTimeout> | null = null;

  private constructor(fileName: string, handle: FileSystemFileHandle | null) {
    this.fileName = fileName;
    this.#handle = handle;
  }

  /** Open (and rehydrate) the recorder for `audit-<engineId>.jsonl`. */
  static async open(fileName: string): Promise<BrowserAuditRecorder> {
    let handle: FileSystemFileHandle | null = null;
    let existing = "";
    if (supportsOpfs()) {
      try {
        const root = await navigator.storage.getDirectory();
        handle = await root.getFileHandle(fileName, { create: true });
        existing = await (await handle.getFile()).text();
      } catch {
        handle = null;
      }
    }
    const recorder = new BrowserAuditRecorder(fileName, handle);
    if (existing) {
      // Keep the trailing newline on each line so the buffer re-serializes
      // byte-for-byte; drop a dangling partial last line if the file was cut.
      recorder.#lines = existing
        .split(/(?<=\n)/)
        .filter((line) => line.endsWith("\n"));
      recorder.#seq = recorder.#lines.length;
    }
    return recorder;
  }

  record(event: MarmotAuditEvent): void {
    if (this.#closed) return;
    this.#lines.push(`${JSON.stringify({ ...event, seq: this.#seq++ })}\n`);
    this.#scheduleFlush();
  }

  /** The full JSONL body to upload. */
  readNdjson(): string {
    return this.#lines.join("");
  }

  async flush(): Promise<void> {
    if (this.#flushTimer != null) {
      clearTimeout(this.#flushTimer);
      this.#flushTimer = null;
    }
    await this.#persist();
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    await this.flush();
  }

  #scheduleFlush(): void {
    if (this.#flushTimer != null || !this.#handle) return;
    this.#flushTimer = setTimeout(() => {
      this.#flushTimer = null;
      void this.#persist();
    }, 250);
  }

  /**
   * Overwrite the OPFS file with the current buffer. Serialized through a write
   * chain because OPFS allows only one open writable per file at a time. Failures
   * are swallowed — persistence is best-effort and never blocks the in-memory log
   * that uploads read from.
   */
  #persist(): Promise<void> {
    const handle = this.#handle;
    if (!handle) return Promise.resolve();
    const data = this.#lines.join("");
    this.#writeChain = this.#writeChain.then(async () => {
      try {
        const writable = await handle.createWritable();
        await writable.write(data);
        await writable.close();
      } catch {
        // best-effort persistence
      }
    });
    return this.#writeChain;
  }
}

/** Non-identifying client labels sent as `X-Goggles-*` headers on upload. */
export interface AuditUploadSource {
  deviceLabel?: string;
  platform?: string;
  appVersion?: string;
}

export interface AuditUploadOptions {
  /** Bearer token. Required for any non-loopback endpoint. */
  bearerToken?: string;
  /** Optional client labels, sent as `X-Goggles-*` headers. */
  source?: AuditUploadSource;
  /** Total request timeout in milliseconds (default 60_000). */
  timeoutMs?: number;
}

export interface AuditUploadResult {
  status: number;
  bytesSent: number;
}

/** True for an `http:` endpoint whose host is a loopback address. */
function isLoopbackHttp(url: URL): boolean {
  if (url.protocol !== "http:") return false;
  const host = url.hostname;
  return (
    host === "localhost" ||
    host === "::1" ||
    host === "[::1]" ||
    host.startsWith("127.")
  );
}

/**
 * Upload an audit JSONL body to a Goggles tracker, mirroring the reference
 * app's `post_audit_log_file` contract: a `POST` of the raw NDJSON body with
 * `Content-Type: application/x-ndjson`, an optional bearer token, and
 * non-identifying `X-Goggles-*` source headers.
 *
 * Validation matches the reference: the body must be at most 64 MiB, the
 * endpoint must be `https` (or loopback `http` for local testing), and a
 * non-loopback endpoint requires a bearer token. Throws a normalized error
 * (`HTTP <status>`, `request timed out`, or `connection failed`) on failure.
 */
export async function uploadAuditLog(
  ndjson: string,
  endpoint: string,
  options: AuditUploadOptions = {},
): Promise<AuditUploadResult> {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new Error("audit log tracker endpoint is not a valid URL");
  }
  const loopback = isLoopbackHttp(url);
  if (url.protocol !== "https:" && !loopback)
    throw new Error(
      "audit log tracker endpoint must be https (or loopback http for local testing)",
    );
  if (!loopback && !options.bearerToken)
    throw new Error("audit log tracker endpoint requires a bearer token");

  const body = new TextEncoder().encode(ndjson);
  if (body.byteLength === 0) throw new Error("audit log is empty");
  if (body.byteLength > MAX_AUDIT_UPLOAD_BYTES)
    throw new Error(
      `audit log is too large (${body.byteLength} bytes, max ${MAX_AUDIT_UPLOAD_BYTES})`,
    );

  const headers: Record<string, string> = {
    "Content-Type": "application/x-ndjson",
  };
  if (options.bearerToken)
    headers["Authorization"] = `Bearer ${options.bearerToken}`;
  if (options.source?.deviceLabel)
    headers["X-Goggles-Device-Label"] = options.source.deviceLabel;
  if (options.source?.platform)
    headers["X-Goggles-Platform"] = options.source.platform;
  if (options.source?.appVersion)
    headers["X-Goggles-App-Version"] = options.source.appVersion;

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), options.timeoutMs ?? 60_000);
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers,
      body,
      signal: abort.signal,
    });
  } catch (err) {
    if (abort.signal.aborted) throw new Error("request timed out");
    throw new Error("connection failed", { cause: err });
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return { status: response.status, bytesSent: body.byteLength };
}

/** Build the audit file name for an engine. Matches {@link AUDIT_FILE_NAME}. */
export function auditFileName(engineId: string): string {
  const name = `audit-${engineId}.jsonl`;
  if (!AUDIT_FILE_NAME.test(name)) throw new Error("invalid audit file name");
  return name;
}
