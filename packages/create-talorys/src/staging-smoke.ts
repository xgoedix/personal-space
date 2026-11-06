import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import type { Automation, AutomationRun, ChatStreamEvent, Note, Notification, PushStatus, Settings } from "@talorys/shared";
import type { Manifest } from "./manifest";
import { assertStagingManifest } from "./staging-guard";

/** Real HTTPS integration test. Only synthetic data; credentials and cookies stay in memory. */
export async function verifyStaging(manifest: Manifest, password: string, log: (message: string) => void) {
  assertStagingManifest(manifest);
  assert(manifest.public_url);
  const base = manifest.public_url;
  const checks: string[] = [];
  const pass = (message: string) => { checks.push(message); log(`✓ ${message}`); };
  const marker = `PRUEBA-V2-${randomBytes(4).toString("hex")}`;
  const sessions: Array<{ cookie: string }> = [];
  function client() {
    const state = { cookie: "" }; sessions.push(state);
    return async (path: string, method = "GET", body?: unknown) => {
      assert(path.startsWith("/") && !path.startsWith("//"));
      const response = await fetch(`${base}/api${path}`, {
        method, redirect: "error", signal: AbortSignal.timeout(180_000),
        headers: { origin: base, "x-talorys-request": "1", "content-type": "application/json", ...(state.cookie ? { cookie: state.cookie } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const cookie = response.headers.get("set-cookie");
      if (cookie) state.cookie = cookie.split(";")[0]!;
      return response;
    };
  }
  type Client = ReturnType<typeof client>;
  async function json<T>(c: Client, path: string): Promise<T> {
    const r = await c(path); assert.equal(r.status, 200, `${path} returned ${r.status}`); return r.json() as Promise<T>;
  }
  async function chat(c: Client, message: string) {
    const r = await c("/chat", "POST", { message }); assert.equal(r.status, 200, "Chat request failed");
    const raw = await r.text();
    const events: ChatStreamEvent[] = raw.split("\n\n").flatMap(frame => {
      const data = frame.split("\n").filter(l => l.startsWith("data:")).map(l => l.slice(5).trim()).join("\n");
      return data ? [JSON.parse(data) as ChatStreamEvent] : [];
    });
    const error = events.find(e => e.type === "error");
    assert(!error, error?.type === "error" ? `Workers AI: ${error.code}: ${error.message}` : "Chat failed");
    assert(events.some(e => e.type === "done"), "Chat ended without a persisted completion");
    return events;
  }
  const c = client();
  try {
    assert.equal((await c("/notes")).status, 401);
    assert.equal((await c("/automations")).status, 401);
    assert.equal((await c("/push")).status, 401);
    pass("API privada: notas, recordatorios y push rechazan el acceso anónimo");
    const login = await c("/auth/login", "POST", { password });
    assert.equal(login.status, 200, "Login failed");
    assert.match(login.headers.get("set-cookie") ?? "", /HttpOnly/i);
    assert.match(login.headers.get("set-cookie") ?? "", /Secure/i);
    pass("Inicio de sesión real con cookie protegida");
    const system = await json<{ installation_id: string; ai_binding: boolean; ai_provider: string; environment: string }>(c, "/system");
    assert.equal(system.installation_id, manifest.installation_id); assert.equal(system.ai_binding, true);
    assert.equal(system.environment, "production"); assert.equal(system.ai_provider, "workers-ai");
    const { settings } = await json<{ settings: Settings }>(c, "/settings");
    assert.equal(settings.demoMode, false); assert.equal(settings.timezone, "Europe/Madrid");
    pass("Worker correcto, Workers AI real, modo demo desactivado y zona Europe/Madrid");
    const push = await json<PushStatus>(c, "/push");
    assert(push.available && push.public_key); pass("Claves Web Push configuradas en staging");
    const noteEvents = await chat(c, `Guarda una nota que diga comprar un regalo. Incluye el identificador ${marker} en la nota; son datos de prueba.`);
    assert(noteEvents.some(e => e.type === "tool" && e.tool.name === "create_note" && e.tool.status === "success"), "AI did not successfully execute create_note");
    const notes = await json<{ notes: Note[] }>(c, "/notes");
    const note = notes.notes.find(n => `${n.title} ${n.content}`.includes(marker)); assert(note, "The note was not persisted");
    pass(`IA ejecutó create_note y se verificó la nota ${note.id} en SQLite`);
    await c("/auth/logout", "POST");
    assert.equal((await c("/notes")).status, 401);
    const c2 = client(); assert.equal((await c2("/auth/login", "POST", { password })).status, 200);
    const reread = await json<{ notes: Note[] }>(c2, "/notes");
    assert(reread.notes.some(n => n.id === note.id && n.content === note.content));
    pass("Nota conservada después de cerrar sesión e iniciar otra independiente");
    const start = Date.now();
    const reminderEvents = await chat(c2, `Recuérdame dentro de 5 minutos que tengo que llamar a alguien. Incluye ${marker} en el mensaje; es una prueba.`);
    assert(reminderEvents.some(e => e.type === "tool" && e.tool.name === "create_reminder" && e.tool.status === "success"), "AI did not successfully execute create_reminder");
    const automations = await json<{ automations: Automation[] }>(c2, "/automations");
    const reminder = automations.automations.find(a => JSON.stringify(a).includes(marker)); assert(reminder?.next_run);
    const due = Date.parse(reminder.next_run);
    assert(due >= start + 4 * 60_000 && due <= Date.now() + 7 * 60_000, "Reminder not scheduled around five minutes");
    pass(`Recordatorio persistido ${reminder.id}, ejecución prevista ${reminder.next_run}`);
    const pending = await chat(c2, "¿Qué tengo pendiente? Consulta mis tareas y recordatorios actuales.");
    assert(pending.some(e => e.type === "tool" && ["list_tasks", "list_automations"].includes(e.tool.name) && e.tool.status === "success"));
    pass("Consulta de pendientes mediante herramientas reales");
    // No browser, SSE or websocket remains connected while the server's alarm fires.
    while (Date.now() < due + 120_000) {
      const { notifications } = await json<{ notifications: Notification[] }>(c2, "/notifications");
      const notification = notifications.find(n => `${n.title} ${n.body}`.includes(marker));
      if (notification) {
        const runs = await json<{ runs: AutomationRun[] }>(c2, `/automations/${reminder.id}/runs`);
        assert(runs.runs.some(r => r.status === "success"), "No successful automation run");
        pass(`Alarma ejecutada sin aplicación abierta; notificación persistida ${notification.id}`);
        const report = { tested_at: new Date().toISOString(), url: base, marker, checks, manual: ["Instalar la PWA en iPhone, activar push y comprobar la recepción con la aplicación cerrada."] };
        return report;
      }
      log(`Esperando la alarma del servidor (${Math.max(0, Math.ceil((due - Date.now()) / 1000))} s hasta la hora programada)…`);
      await delay(20_000);
    }
    throw new Error("The scheduled reminder did not produce a notification within two minutes of its due time.");
  } finally {
    for (const s of sessions) {
      if (!s.cookie) continue;
      await fetch(`${base}/api/auth/logout`, { method: "POST", headers: { origin: base, "x-talorys-request": "1", cookie: s.cookie }, signal: AbortSignal.timeout(10_000) }).catch(() => {});
      s.cookie = "";
    }
  }
}
