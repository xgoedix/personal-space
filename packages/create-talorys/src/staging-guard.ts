import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { resourceNames } from "./config";
import type { Manifest } from "./manifest";
import { Wrangler } from "./wrangler";

export function assertStagingId(id: string): void {
  if (!/^psst[a-z0-9]{8}$/.test(id)) throw new Error("Refusing a resource outside the Personal Space staging namespace.");
}
export function assertStagingManifest(m: Manifest): void {
  assertStagingId(m.installation_id);
  const names = resourceNames(m.installation_id);
  if (m.worker_name !== names.workerName || m.pages_project_name !== names.pagesProjectName ||
      (m.public_url !== null && m.public_url !== `https://${names.pagesProjectName}.pages.dev`)) {
    throw new Error("Staging manifest names or URL do not match its isolated installation.");
  }
}
export function assertStagingName(name: string, kind: "agent" | "web"): void {
  if (!new RegExp(`^talorys-psst[a-z0-9]{8}-${kind}$`).test(name)) throw new Error("Refusing access to a non-staging resource.");
}
function config(path: string) {
  return JSON.parse(readFileSync(path, "utf8").replace(/^\/\/[^\n]*\n/, ""));
}

/** All resource reads and writes are scoped, even when resuming an edited manifest. */
export class StagingWrangler extends Wrangler {
  constructor(private readonly directory: string) { super(); }
  private inside(path: string, suffix: string) {
    if (resolve(path) !== resolve(this.directory, suffix)) throw new Error("Unexpected staging configuration path.");
  }
  override workerExists(name: string) { assertStagingName(name, "agent"); return super.workerExists(name); }
  override listSecrets(name: string) { assertStagingName(name, "agent"); return super.listSecrets(name); }
  override putSecrets(name: string, secrets: Record<string, string>) {
    assertStagingName(name, "agent"); return super.putSecrets(name, secrets);
  }
  override deployWorker(path: string) {
    this.inside(path, "agent/wrangler.jsonc");
    const c = config(path);
    assertStagingId(c.vars.TALORYS_INSTALLATION_ID);
    assertStagingName(c.name, "agent");
    if (c.name !== resourceNames(c.vars.TALORYS_INSTALLATION_ID).workerName || c.workers_dev !== false ||
        c.preview_urls !== false || c.vars.TALORYS_ENV || c.vars.TALORYS_SEMANTIC_DEFAULT || c.routes ||
        c.services || c.d1_databases || c.kv_namespaces || c.r2_buckets ||
        c.durable_objects.bindings.some((b: { script_name?: string }) => b.script_name)) {
      throw new Error("Staging backend must be private with independent local storage and no external resources.");
    }
    return super.deployWorker(path);
  }
  override createPagesProject(name: string, cwd: string, date: string) {
    assertStagingName(name, "web"); this.inside(cwd, "web");
    return super.createPagesProject(name, cwd, date);
  }
  override deployPages(cwd: string, name: string, output: string) {
    this.inside(cwd, "web"); assertStagingName(name, "web");
    const c = config(join(cwd, "wrangler.jsonc"));
    if (c.name !== name || output !== "dist" || c.services?.length !== 1 ||
        c.services[0].binding !== "AGENT" || c.services[0].service !== name.replace(/-web$/, "-agent")) {
      throw new Error("Pages must bind exclusively to its matching staging Worker.");
    }
    return super.deployPages(cwd, name, output);
  }
}
