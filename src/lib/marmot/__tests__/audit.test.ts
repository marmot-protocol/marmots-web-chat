import { afterEach, describe, expect, it, vi } from "vitest";

import { uploadAuditLog } from "@/lib/marmot/audit";

afterEach(() => vi.unstubAllGlobals());

describe("audit upload policy", () => {
  it("does not treat a domain beginning with 127 as a loopback address", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(
      uploadAuditLog("{}\n", "http://127.example.com/"),
    ).rejects.toThrow("must be https");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("allows a local development tracker without a bearer token", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetch);
    expect(await uploadAuditLog("{}\n", "http://127.0.0.1:8080/")).toEqual({
      status: 204,
      bytesSent: 3,
    });
  });
});
