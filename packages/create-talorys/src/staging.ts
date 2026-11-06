import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";
import { generateInstallationId } from "./config";
import { install } from "./install";
import { markStep, readManifest } from "./manifest";
import { validatePassword } from "./secrets";
import { ClackUi } from "./ui";
import { assertStagingManifest, StagingWrangler } from "./staging-guard";
import { verifyStaging } from "./staging-smoke";
import { allowsSetupPost } from "./staging-form";
import { verifyDeployment } from "./verify";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const directory = join(root, ".personal-space/staging");
for (const key of ["TALORYS_TEST_VERIFY_ORIGIN", "TALORYS_WRANGLER_BIN", "VITE_PERSONAL_PREVIEW", "CLOUDFLARE_API_BASE_URL"]) {
  if (process.env[key] && process.env[key] !== "false") throw new Error(`Remove ${key} before staging deployment.`);
}
process.env.TZ = "Europe/Madrid";
process.env.WRANGLER_SEND_METRICS = "false";
const existing = readManifest(directory);
if (existing) assertStagingManifest(existing);
const verifyOnly = process.argv.includes("--verify-only");
if (verifyOnly && !existing?.public_url) throw new Error("No deployed staging URL to verify.");
const token = randomBytes(24).toString("hex");
let origin = "";
let running = false;
let finished = false;
let failed = false;
const messages: string[] = [];
let publicUrl: string | null = existing?.public_url ?? null;
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const log = (message: string) => { messages.push(message); console.log(message); };
class SetupUi extends ClackUi {
  override info() {} override success() {} override note() {} override intro() {} override outro() {}
  override async step<T>(title: string, fn: (update: (message: string) => void) => Promise<T>): Promise<T> {
    log(title); const result = await fn(log); log(`✓ ${title}`); return result;
  }
}
async function run(password: string) {
  try {
    let manifest = verifyOnly ? existing! : await install({ dir: directory, yes: true, agentName: "Personal Space", password, semantic: false, verifyTimeoutMs: 180_000 }, {
      ui: new SetupUi(), wrangler: new StagingWrangler(directory), nextInstallationId: () => `psst${generateInstallationId()}`,
    });
    assertStagingManifest(manifest); publicUrl = manifest.public_url;
    if (verifyOnly) {
      const checks = await verifyDeployment(publicUrl!, { onWait: log, timeoutMs: 180_000 });
      for (const c of checks) log(`${c.ok ? "✓" : "✗"} ${c.name}: ${c.detail}`);
      if (checks.some(c => !c.ok)) throw new Error("Deployment health checks failed.");
      manifest = markStep(directory, { ...manifest, status: "deployed" }, "verified");
    }
    const report = await verifyStaging(manifest, password, log);
    writeFileSync(join(directory, "verification.json"), `${JSON.stringify(report, null, 2)}\n`);
    log(`Verificación automática terminada. Falta comprobar la recepción push en tu iPhone. URL: ${publicUrl}`);
    finished = true;
  } catch (error) {
    failed = true;
    log(`ERROR: ${error instanceof Error ? error.message : "No se pudo completar el staging"}`);
  } finally {
    password = "";
    // Keep the local result visible briefly; secrets are no longer needed.
    setTimeout(() => server.close(), 15 * 60_000).unref();
  }
}
const server = createServer(async (req, res) => {
  const headers = {
    "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  };
  function page(content: string, status = 200) {
    res.writeHead(status, headers);
    res.end(`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Personal Space · Preparar staging</title><style>body{font:17px system-ui;background:#f2ebdd;color:#24241e;max-width:680px;margin:8vh auto;padding:24px}h1{font-size:36px;font-weight:500}label{display:block;margin-top:24px}input{display:block;box-sizing:border-box;width:100%;padding:14px;margin-top:8px;border:1px solid #999;border-radius:12px;font:inherit}button{margin-top:24px;padding:16px 24px;border:0;border-radius:30px;background:#24241e;color:white;font:inherit}small{display:block;margin:16px 0;color:#555}li{margin:12px 0}a{color:inherit}</style>${content}</html>`);
  }
  if (req.headers.host !== new URL(origin).host || req.url?.split("?")[0] !== `/${token}`) return page("No encontrado.", 404);
  if (req.method === "POST") {
    if (!allowsSetupPost({ origin: req.headers.origin, contentType: req.headers["content-type"], fetchSite: req.headers["sec-fetch-site"] as string | undefined }, origin)) {
      // Metadata only: never log the body, password, cookies or arbitrary headers.
      log(`Formulario rechazado: origin=${req.headers.origin ?? "ausente"}, content-type=${req.headers["content-type"] ?? "ausente"}, fetch-site=${req.headers["sec-fetch-site"] ?? "ausente"}`);
      return page("Solicitud rechazada. Vuelve a abrir el formulario desde el enlace local.", 403);
    }
    if (running) return page("La instalación ya está en curso.", 409);
    let raw = "";
    try {
      for await (const chunk of req) { raw += chunk.toString(); if (raw.length > 4096) throw new Error("Too large"); }
    } catch { return page("Solicitud no válida.", 400); }
    const form = new URLSearchParams(raw); raw = "";
    let password = form.get("password") ?? "";
    const valid = form.get("csrf") === token && password === form.get("confirmation") && !validatePassword(password);
    form.delete("password"); form.delete("confirmation");
    if (!valid) { password = ""; return page('<h1>Revisa la contraseña</h1><p>Deben coincidir y tener al menos 10 caracteres, combinando letras con números o símbolos, o una frase de 16 caracteres.</p><a href="">Volver</a>', 400); }
    running = true;
    res.writeHead(303, { ...headers, location: `/${token}` }); res.end();
    void run(password); password = ""; return;
  }
  if (req.method !== "GET") return page("Método no permitido.", 405);
  if (running) {
    return page(`<h1>${finished ? "Staging conectado" : failed ? "La instalación necesita atención" : "Preparando tu staging"}</h1>${publicUrl ? `<p><a href="${escapeHtml(publicUrl)}">Abrir Personal Space</a></p>` : ""}<p>${finished ? "Las operaciones del backend están verificadas. Falta probar la recepción push en tu iPhone." : "Puedes actualizar esta página para consultar el progreso."}</p><ol>${messages.map(m => `<li>${escapeHtml(m)}</li>`).join("")}</ol><a href="">Actualizar estado</a>`);
  }
  page(`<h1>Acceso privado a staging</h1><p>${existing ? "Introduce la contraseña de esta instalación de prueba para verificarla." : "Elige una contraseña nueva para Personal Space. Se usará solo en la instalación de prueba."}</p><p>Este formulario está en tu ordenador. La contraseña no se muestra en el chat ni se guarda en archivos; se usa para configurar el acceso y verificar el backend.</p><form method="post"><input type="hidden" name="csrf" value="${token}"><label>Contraseña<input type="password" name="password" autocomplete="${existing ? "current-password" : "new-password"}" minlength="10" maxlength="256" required></label><label>Repetir contraseña<input type="password" name="confirmation" autocomplete="new-password" minlength="10" maxlength="256" required></label><small>10 caracteres o más, con letras y números o símbolos. También puedes usar una frase de 16 caracteres o más. Guárdala en tu gestor de contraseñas.</small><button>${verifyOnly ? "Verificar backend" : existing ? "Actualizar y verificar staging" : "Preparar y verificar staging"}</button></form><small>${verifyOnly ? "Se verificará únicamente el staging existente." : "Se usarán recursos separados."} Talorys original y sus datos permanecerán intactos.</small>`);
});
server.listen(0, "127.0.0.1", () => {
  const address = server.address(); if (!address || typeof address === "string") throw new Error("No local address");
  origin = `http://127.0.0.1:${address.port}`;
  console.log(`SECURE_SETUP_URL=${origin}/${token}`);
});
