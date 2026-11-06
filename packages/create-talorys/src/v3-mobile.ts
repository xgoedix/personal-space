import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";
import { install } from "./install";
import { generateInstallationId } from "./config";
import { readManifest } from "./manifest";
import { V3Wrangler, assertV3Manifest } from "./v3-guard";
import { verifyV3 } from "./v3-smoke";
import { ClackUi } from "./ui";
import { buildOwnerSecrets } from "./secrets";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const directory = join(root, ".personal-space/v3");
const existing = readManifest(directory);
if (existing) {
  assertV3Manifest(existing);
  if (!process.argv.includes("--resume-unclaimed")) throw new Error("Existing preview: owner access is required. --resume-unclaimed is only for an enrollment that has never been activated.");
}
for (const key of ["TALORYS_TEST_VERIFY_ORIGIN", "TALORYS_WRANGLER_BIN", "VITE_PERSONAL_PREVIEW", "CLOUDFLARE_API_BASE_URL"])
  if (process.env[key] && process.env[key] !== "false") throw new Error(`Remove ${key} before deployment.`);
process.env.TZ = "Europe/Madrid";
process.env.WRANGLER_SEND_METRICS = "false";

class MobileWrangler extends V3Wrangler {
  override deployWorker(path: string) {
    if (resolve(path) !== resolve(directory, "agent/wrangler.jsonc")) throw new Error("Unexpected configuration path");
    const config = JSON.parse(readFileSync(path, "utf8").replace(/^\/\/[^\n]*\n/, ""));
    config.vars.BICHO_ENROLLMENT = "1";
    writeFileSync(path, JSON.stringify(config, null, 2));
    return super.deployWorker(path);
  }
}
class SetupUi extends ClackUi {
  override info() {}
  override success() {}
  override note() {}
  override intro() {}
  override outro() {}
  override async step<T>(title: string, fn: (update: (message: string) => void) => Promise<T>): Promise<T> {
    console.log(title);
    const result = await fn(console.log);
    console.log(`✓ ${title}`);
    return result;
  }
}
// Never logged, persisted in files, passed on the command line or sent to the user.
let password = randomBytes(48).toString("base64url");
let cookie = "";
let verified = false;
async function deploy() {
  const m = await install({ dir: directory, yes: true, agentName: "BichO", password, semantic: false, verifyTimeoutMs: 180_000 },
    { ui: new SetupUi(), wrangler: new MobileWrangler(directory), nextInstallationId: () => `biv3${generateInstallationId()}` });
  assertV3Manifest(m);
  console.log(`PREVIEW_URL=${m.public_url}`);
}
async function verify() {
  const m = readManifest(directory);
  if (!m?.public_url) throw new Error("Preview not deployed");
  assertV3Manifest(m);
  const report = await verifyV3(m, password, console.log);
  writeFileSync(join(directory, "verification.json"), `${JSON.stringify(report, null, 2)}\n`);
  verified = true;
  console.log(`VERIFIED_PREVIEW_URL=${m.public_url}`);
}
async function approve(id: string) {
  if (!verified) throw new Error("Run verify successfully before activating owner access.");
  const m = readManifest(directory)!;
  assertV3Manifest(m);
  const base = m.public_url!;
  const headers = { "content-type": "application/json", origin: base, "x-talorys-request": "1" };
  const login = await fetch(`${base}/api/auth/login`, { method: "POST", headers, body: JSON.stringify({ password }), redirect: "error" });
  if (!login.ok) throw new Error(`Owner verification failed (${login.status})`);
  cookie = login.headers.get("set-cookie")!.split(";")[0]!;
  const response = await fetch(`${base}/api/auth/enrollment/${id}/approve`, { method: "POST", headers: { ...headers, cookie }, body: "{}", redirect: "error" });
  if (!response.ok) {
    await fetch(`${base}/api/auth/logout`, { method: "POST", headers: { ...headers, cookie }, body: "{}" });
    cookie = "";
    throw new Error(`Activation failed (${response.status}); check the request ID and its expiry.`);
  }
  const state = await (await fetch(`${base}/api/auth/session`, { headers: { cookie } })).json() as { authenticated: boolean; enrollment_available: boolean };
  if (state.authenticated || state.enrollment_available) throw new Error("Enrollment closure check failed");
  const oldLogin = await fetch(`${base}/api/auth/login`, { method: "POST", headers, body: JSON.stringify({ password }) });
  if (oldLogin.status !== 401) throw new Error("Temporary access was not revoked");
  password = ""; cookie = "";
  console.log(`ACTIVATED: acceso temporal revocado, alta cerrada. Inicia sesión con la contraseña elegida en ${base}`);
}
const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
try {
  if (existing) {
    if (!existing.public_url) throw new Error("Cannot recover without the exact deployed preview URL");
    const response = await fetch(`${existing.public_url}/api/auth/session`, { redirect: "error" });
    const state = await response.json() as { enrollment_available?: boolean };
    if (!response.ok || state.enrollment_available !== true) throw new Error("Refusing to reset an activated installation or one without verified open enrollment.");
    await new V3Wrangler(directory).putSecrets(existing.worker_name, await buildOwnerSecrets(password, { includeSessionSecret: false }));
    console.log("Recovered only the temporary access to the unclaimed V3 preview.");
  }
  await deploy(); await verify();
}
catch (e) { console.error(e instanceof Error ? e.message : "Deployment/verification failed"); }
console.log("Esperando el identificador NO SECRETO enviado por el propietario. Comandos: verify, deploy, o UUID para activar esa solicitud. Mantén este proceso abierto.");
for await (const line of input) {
  const command = line.trim();
  try {
    if (command === "verify") await verify();
    else if (command === "deploy") await deploy();
    else if (/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(command)) { await approve(command); break; }
    else console.log("Comando no reconocido. No introduzcas contraseñas.");
  } catch (e) { console.error(e instanceof Error ? e.message : "Operation failed"); }
}
input.close();
password = ""; cookie = "";
