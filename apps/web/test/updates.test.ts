import { describe, expect, it } from "vitest";
import { availableVersion, hasLocalDraft } from "../src/lib/updates";

const response = (data: unknown, status = 200) => (async () => Response.json(data, { status })) as typeof fetch;
describe("release checks", () => {
  it("reports a different release, including a rollback, without reloading", async () => {
    expect(await availableVersion("version-002", response({ version: "version-001" }))).toBe("version-001");
    expect(await availableVersion("version-002", response({ version: "version-002" }))).toBeNull();
  });
  it("ignores offline errors, invalid metadata and unavailable deployments", async () => {
    expect(await availableVersion("version-002", (async () => { throw new Error("offline"); }) as typeof fetch)).toBeNull();
    expect(await availableVersion("version-002", response({ version: "version-003" }, 503))).toBeNull();
    expect(await availableVersion("version-002", response({ version: {} }))).toBeNull();
    expect(await availableVersion("", response({ version: "version-003" }))).toBeNull();
  });
  it("bypasses cached release metadata and keeps requests on the same origin", async () => {
    await availableVersion("version-002", (async (url, init) => {
      expect(url).toBe("/release.json");
      expect(init?.cache).toBe("no-store");
      expect(init?.credentials).toBe("same-origin");
      return Response.json({ version: "version-003" });
    }) as typeof fetch);
  });
});

it("protects controlled React inputs even when defaultValue matches the edited value", () => {
  const document = { querySelectorAll: (selector: string) => selector.startsWith("input") ? [{ value: "sin enviar", defaultValue: "sin enviar" }] : [] } as unknown as Document;
  expect(hasLocalDraft(document)).toBe(true);
});
