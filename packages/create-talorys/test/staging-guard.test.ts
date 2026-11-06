import { describe, expect, it } from "vitest";
import { assertStagingId, assertStagingManifest, assertStagingName, StagingWrangler } from "../src/staging-guard";
import type { Manifest } from "../src/manifest";
import { generateAgentConfig, generatePagesConfig, toJsonc } from "../src/config";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { allowsSetupPost } from "../src/staging-form";

const id = "psstabcdefgh";
const manifest = {
  installation_id: id, worker_name: `talorys-${id}-agent`, pages_project_name: `talorys-${id}-web`,
  public_url: `https://talorys-${id}-web.pages.dev`,
} as Manifest;

describe("independent staging boundary", () => {
  it("accepts WebView form requests but rejects foreign origins and cross-site posts", () => {
    const local = "http://127.0.0.1:50000";
    const base = { contentType: "application/x-www-form-urlencoded" };
    for (const origin of [local, undefined, "null"]) expect(allowsSetupPost({ ...base, origin }, local)).toBe(true);
    expect(allowsSetupPost({ ...base, origin: "https://example.com" }, local)).toBe(false);
    expect(allowsSetupPost({ ...base, origin: "null", fetchSite: "cross-site" }, local)).toBe(false);
    expect(allowsSetupPost({ origin: local, contentType: "application/json" }, local)).toBe(false);
  });
  it("accepts only the dedicated prefix and matching resources", () => {
    expect(() => assertStagingManifest(manifest)).not.toThrow();
    for (const id of ["etfd7yab", "dev", "psst", "psstabcdefgh-agent"]) expect(() => assertStagingId(id)).toThrow();
    expect(() => assertStagingName("talorys-etfd7yab-agent", "agent")).toThrow();
    expect(() => assertStagingName("talorys-psstabcdefgh-web", "agent")).toThrow();
  });
  it("rejects a resumed manifest redirected to production or another staging", () => {
    for (const override of [
      { worker_name: "talorys-etfd7yab-agent" },
      { pages_project_name: "talorys-psstijklmnop-web" },
      { public_url: "https://talorys-etfd7yab-web.pages.dev" },
      { public_url: `${manifest.public_url}.evil.test` },
    ]) expect(() => assertStagingManifest({ ...manifest, ...override })).toThrow();
  });
  it("blocks deployment configs linking production before any CLI command", () => {
    const dir = mkdtempSync(join(tmpdir(), "ps-guard-"));
    try {
      mkdirSync(join(dir, "agent")); mkdirSync(join(dir, "web"));
      const w = new StagingWrangler(dir);
      const path = join(dir, "agent/wrangler.jsonc");
      const cfg = generateAgentConfig({ workerName: manifest.worker_name, installationId: id, timezone: "Europe/Madrid", version: "test", agentName: "Test" });
      writeFileSync(path, toJsonc({ ...cfg, durable_objects: { bindings: [{ name: "TalorysAgent", class_name: "TalorysAgent", script_name: "talorys-etfd7yab-agent" }] } }));
      expect(() => w.deployWorker(path)).toThrow();
      writeFileSync(join(dir, "web/wrangler.jsonc"), toJsonc(generatePagesConfig({ pagesProjectName: manifest.pages_project_name, workerName: "talorys-etfd7yab-agent" })));
      expect(() => w.deployPages(join(dir, "web"), manifest.pages_project_name, "dist")).toThrow();
      expect(() => w.putSecrets("talorys-etfd7yab-agent", {})).toThrow();
      expect(() => w.listSecrets("talorys-etfd7yab-agent")).toThrow();
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
