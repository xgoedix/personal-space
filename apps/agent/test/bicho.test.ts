import { migrate, LATEST_SCHEMA_VERSION } from "../src/db/migrations";
import { describe, it, expect, vi } from "vitest";
import { inAgent, loggedIn, client, bearer } from "./helpers";
import { exportData, importData } from "../src/services/backup";
import { startCapture, captureResult } from "../src/bicho/capture";
import { AgentRunner } from "../src/agent/runner";
import type {
	AIProvider,
	AgentEvent,
	ToolRequest,
	GenerateRequest,
} from "../src/ai/provider";
class Script implements AIProvider {
	id = "test";
	model = "test";
	billable = false;
	calls = 0;
	constructor(
		readonly steps: { tool?: string; input?: unknown; text?: string }[],
	) {}
	async generate(_r: GenerateRequest) {
		return {
			text: "resumen",
			usage: {
				model: "test",
				billable: false,
				inputTokens: { reported: 0, estimated: 0 },
				outputTokens: { reported: 0, estimated: 0 },
				cachedInputTokens: 0,
			},
		};
	}
	async *stream(_r: GenerateRequest): AsyncIterable<AgentEvent> {}
	async *generateWithTools(r: ToolRequest): AsyncIterable<AgentEvent> {
		this.calls++;
		for (const [n, s] of this.steps.entries()) {
			if (s.text) yield { type: "text", delta: s.text };
			if (s.tool) {
				const id = String(n);
				yield { type: "tool-start", id, name: s.tool, input: s.input };
				try {
					const t = r.tools.find((t) => t.name === s.tool);
					if (!t) throw Error("No disponible");
					yield {
						type: "tool-end",
						id,
						name: s.tool,
						output: await t.execute(s.input, id),
					};
				} catch (e) {
					yield {
						type: "tool-end",
						id,
						name: s.tool,
						output: null,
						error: String(e),
					};
				}
			}
		}
	}
}
const unique = () => `PRUEBA-V3-${crypto.randomUUID()}`;
describe("listas reales", () => {
	it("persiste casillas entre sesiones, evita duplicados y reordena", async () => {
		const a = await loggedIn();
		const name = unique();
		const r = await a.json("/api/lists", {
			method: "POST",
			body: { name, items: ["Huevos", "Leche", "café", " HUEVOS "] },
		});
		expect(r.list.items).toHaveLength(3);
		const first = r.list.items[0];
		expect(
			(
				await a.call(`/api/list-items/${first.id}`, {
					method: "PATCH",
					body: { completed: true },
				})
			).status,
		).toBe(200);
		const b = await loggedIn();
		const l = (await b.json(`/api/lists/${r.list.id}`)).list;
		expect(l.items[0].completed).toBe(true);
		const again = await b.json("/api/lists", {
			method: "POST",
			body: { name: name.toLowerCase(), items: ["huevos"] },
		});
		expect(again.list.id).toBe(l.id);
		expect(again.list.items).toHaveLength(3);
		expect(again.list.items[0].completed).toBe(true);
		const ids = l.items.map((i: { id: string }) => i.id).reverse();
		expect(
			(
				await b.json(`/api/lists/${l.id}/order`, {
					method: "PUT",
					body: { ids },
				})
			).list.items.map((i: { id: string }) => i.id),
		).toEqual(ids);
		expect(
			(
				await b.call(`/api/lists/${l.id}/order`, {
					method: "PUT",
					body: { ids: ids.slice(1) },
				})
			).status,
		).toBe(400);
		expect(
			(
				await b.call(`/api/lists/${l.id}`, {
					method: "DELETE",
					body: { confirm: false },
				})
			).status,
		).toBe(400);
		expect(
			(
				await b.call(`/api/lists/${l.id}`, {
					method: "DELETE",
					body: { confirm: true },
				})
			).status,
		).toBe(200);
	});
	it("no permite acceso sin autenticar", async () => {
		for (const path of [
			"/api/lists",
			"/api/birthdays",
			"/api/calendar/events",
			"/api/saved-links",
		])
			expect((await client().call(path)).status).toBe(401);
	});
});
describe("cumpleaños y recuperación", () => {
	it("un cumpleaños tiene un solo aviso; editar cambia el mismo y borrar lo cancela", async () => {
		await inAgent(async (a) => {
			const b = a.services.bicho;
			const name = unique();
			const first = await b.saveBirthday({ name, day: 18, month: 5 });
			expect(first.birth_year).toBeNull();
			expect(first.next_run).toBeTruthy();
			const second = await b.saveBirthday({
				name: name.toLowerCase(),
				day: 18,
				month: 5,
			});
			expect(second.id).toBe(first.id);
			expect(second.automation_id).toBe(first.automation_id);
			await expect(b.saveBirthday({ name, day: 19, month: 5 })).rejects.toThrow(
				/otro cumpleaños/,
			);
			const edit = await b.saveBirthday({ name, day: 19, month: 5 }, first.id);
			expect(edit.automation_id).toBe(first.automation_id);
			const schedules = (await a.listSchedules()).filter(
				(s) =>
					(s.payload as { automationId?: string })?.automationId ===
					first.automation_id,
			);
			expect(schedules).toHaveLength(1);
			expect(
				a.services.automations.get(first.automation_id!)?.schedule,
			).toMatchObject({
				type: "yearly",
				month: 5,
				day: 19,
				time: "11:00",
				timezone: "Europe/Madrid",
			});
			await b.deleteBirthday(first.id);
			expect(a.services.automations.get(first.automation_id!)).toBeNull();
		});
	});
	it("un fallo del programador no confirma éxito y el reintento repara el mismo aviso", async () => {
		await inAgent(async (a) => {
			const s = a.services;
			const name = unique();
			const spy = vi
				.spyOn(s.automations, "update")
				.mockRejectedValueOnce(Error("scheduler unavailable"));
			await expect(
				s.bicho.saveBirthday({ name, day: 1, month: 6 }),
			).rejects.toThrow();
			const partial = s.bicho.birthdays().find((b) => b.name === name)!;
			expect(partial).toBeTruthy();
			spy.mockRestore();
			const repaired = await s.bicho.saveBirthday({ name, day: 1, month: 6 });
			expect(repaired.automation_id).toBe(partial.automation_id);
			expect(repaired.next_run).toBeTruthy();
			await s.bicho.deleteBirthday(repaired.id);
		});
	});
	it("copia y restauración conserva listas marcadas y no acredita Apple ni activa alarmas importadas", async () => {
		await inAgent(async (a) => {
			const s = a.services;
			const l = s.bicho.createList({ name: unique(), items: ["Elemento"] });
			s.bicho.updateItem(l.items[0]!.id, { completed: true });
			const birthday = await s.bicho.saveBirthday({
				name: unique(),
				day: 29,
				month: 2,
			});
			const event = s.bicho.createEvent({
				title: unique(),
				start: "2031-01-01T11:00",
				end: "2031-01-01T12:00",
			});
			const backup = exportData(s);
			s.bicho.deleteList(l.id);
			await s.bicho.deleteBirthday(birthday.id);
			s.db.run("DELETE FROM tal_calendar_events WHERE id=?", event.id);
			await importData(s, backup);
			expect(s.bicho.list(l.id).items[0]?.completed).toBe(true);
			expect(s.bicho.birthday(birthday.id).next_run).toBeNull();
			expect(s.bicho.event(event.id).apple_status).toBe("pending");
			await importData(s, backup);
			expect(s.bicho.lists().filter((x) => x.id === l.id)).toHaveLength(1);
		});
	});
});
describe("captura real, seguridad y confirmaciones", () => {
	it("el chat descarta una confirmación inventada tras un fallo", async () => {
		await inAgent(async (a) => {
			const runner = new AgentRunner(
				a.services,
				new Script([
					{ tool: "create_list", input: { name: "", items: [] } },
					{ text: "Ya he guardado tu lista." },
				]),
			);
			const out = [];
			for await (const e of runner.chat({
				message: "Crea lista",
				signal: new AbortController().signal,
			}))
				out.push(e);
			const done = out.find((e) => e.type === "done");
			expect(done?.type === "done" && done.message.content).toContain(
				"No se han completado",
			);
			expect(JSON.stringify(out)).not.toContain("Ya he guardado");
		});
	});
	it("varias herramientas escriben, reintentos no repiten y token revocado no ejecuta", async () => {
		await inAgent(async (a) => {
			const s = a.services;
			s.remote.setEnabled(true);
			const token = await s.remote.create({
				name: unique(),
				scope: "write",
				capability: "capture",
			});
			const caller = (await s.remote.validate(token.token))!;
			const name = unique();
			const provider = new Script([
				{ tool: "create_list", input: { name, items: ["Leche", "Café"] } },
				{
					tool: "create_note",
					input: { title: name, content: "Dato ficticio" },
				},
				{ text: "Respuesta libre que no debe usarse" },
			]);
			const input = {
				request_id: crypto.randomUUID(),
				text: "Crea lista y nota",
			};
			const jobs: Promise<unknown>[] = [];
			await startCapture(s, provider, caller, input, (p) => jobs.push(p));
			await Promise.all(jobs);
			const result = captureResult(s, input.request_id, caller.id);
			expect(result.status).toBe("complete");
			expect(result.actions).toHaveLength(2);
			expect(result.message).not.toContain("Respuesta libre");
			await startCapture(s, provider, caller, input, (p) => jobs.push(p));
			expect(provider.calls).toBe(1);
			await expect(
				startCapture(
					s,
					provider,
					caller,
					{ ...input, text: "otra cosa" },
					(p) => jobs.push(p),
				),
			).rejects.toThrow(/otra captura/);
			s.remote.revoke(caller.id);
			await expect(
				startCapture(
					s,
					provider,
					caller,
					{ request_id: crypto.randomUUID(), text: "x" },
					(p) => jobs.push(p),
				),
			).rejects.toThrow(/revocado/);
		});
	});

  it("una lectura no autoriza una confirmación de escritura del modelo", async () => {
    await inAgent(async a => {
      const runner = new AgentRunner(a.services, new Script([{ tool: "list_tasks", input: {} }, { text: "He guardado una nota." }]));
      const out = [];
      for await (const e of runner.chat({ message: "Guarda una nota de prueba", signal: new AbortController().signal })) out.push(e);
      const done = out.find(e => e.type === "done");
      expect(done?.type === "done" && done.message.content).toContain("No hay ninguna operación confirmada");
      expect(JSON.stringify(out)).not.toContain("He guardado una nota");
    });
  });

  it("limita a 20 capturas nuevas sin gastar IA en la petición rechazada", async () => {
    await inAgent(async a => {
      const s = a.services;
      s.remote.setEnabled(true);
      const token = await s.remote.create({ name: unique(), scope: "write", capability: "capture" });
      const caller = (await s.remote.validate(token.token))!;
      const provider = new Script([{ tool: "ask_clarification", input: { question: "¿Qué quieres guardar?" } }]);
      for (let i = 0; i < 20; i++) {
        const jobs: Promise<unknown>[] = [];
        await startCapture(s, provider, caller, { request_id: crypto.randomUUID(), text: "Prueba" }, p => jobs.push(p));
        await Promise.all(jobs);
      }
      const calls = provider.calls;
      await expect(startCapture(s, provider, caller, { request_id: crypto.randomUUID(), text: "Prueba 21" }, () => {})).rejects.toMatchObject({ code: "RATE_LIMITED" });
      expect(provider.calls).toBe(calls);
    });
  });
	it("error o ambigüedad devuelve estado no completado, no falsa confirmación", async () => {
		await inAgent(async (a) => {
			const s = a.services;
			s.remote.setEnabled(true);
			const t = await s.remote.create({
				name: unique(),
				scope: "write",
				capability: "capture",
			});
			const c = (await s.remote.validate(t.token))!;
			for (const [steps, status] of [
				[
					[{ tool: "create_list", input: { name: "" } }, { text: "Guardado" }],
					"error",
				],
				[
					[
						{
							tool: "ask_clarification",
							input: { question: "¿A las cinco de la mañana o de la tarde?" },
						},
					],
					"needs_input",
				],
			] as const) {
				const id = crypto.randomUUID();
				const jobs: Promise<unknown>[] = [];
				await startCapture(
					s,
					new Script([...steps]),
					c,
					{ request_id: id, text: "prueba" },
					(p) => jobs.push(p),
				);
				await Promise.all(jobs);
				expect(captureResult(s, id, c.id).status).toBe(status);
				expect(captureResult(s, id, c.id).actions).toHaveLength(0);
			}
		});
	});
	it("tokens de captura no acceden a notas/chat/ajustes ni tokens normales a captura", async () => {
		const c = await loggedIn();
		await c.call("/api/remote/status", {
			method: "PATCH",
			body: { enabled: true },
		});
		const create = async (capability: string) =>
			(
				await c.json("/api/remote/tokens", {
					method: "POST",
					body: { name: unique(), scope: "write", capability },
				})
			).token;
		const capture = await create("capture");
		const normal = await create("standard");
		const machine = bearer(capture.token);
		for (const path of ["/api/notes", "/api/settings", "/api/remote/tokens"])
			expect((await machine.call(path)).status).toBe(403);
		expect(
			(
				await machine.call("/api/chat", {
					method: "POST",
					body: { message: "x" },
				})
			).status,
		).toBe(403);
		expect(
			(
				await bearer(normal.token).call("/api/capture", {
					method: "POST",
					body: { request_id: crypto.randomUUID(), text: "x" },
				})
			).status,
		).toBe(403);
		expect((await machine.call("/api/capture/calendar")).status).toBe(200);
		expect(
			(await machine.call(`/api/capture/${crypto.randomUUID()}`)).status,
		).toBe(404);
		await c.call(`/api/remote/tokens/${capture.id}`, { method: "DELETE" });
		expect((await machine.call("/api/capture/calendar")).status).toBe(401);
	});
});
describe("Apple Calendar exige autorización, idempotencia y acuse", () => {
	it("no crea nada automáticamente; exige confirmación y no permite a otro token acreditar eventos", async () => {
		const c = await loggedIn();
		const e = (
			await c.json("/api/calendar/events", {
				method: "POST",
				body: {
					title: unique(),
					start: "2031-05-18T17:00",
					end: "2031-05-18T18:00",
				},
			})
		).event;
		expect(e.apple_status).toBe("pending");
		const id = crypto.randomUUID();
		expect(
			(
				await c.call(`/api/calendar/events/${e.id}/claim`, {
					method: "POST",
					body: { attempt_id: id },
				})
			).status,
		).toBe(400);
		await c.call("/api/remote/status", {
			method: "PATCH",
			body: { enabled: true },
		});
		const t = (
			await c.json("/api/remote/tokens", {
				method: "POST",
				body: { name: unique(), scope: "write", capability: "capture" },
			})
		).token;
		const remote = bearer(t.token);
		expect(
			(
				await remote.call(`/api/calendar/events/${e.id}/claim`, {
					method: "POST",
					body: { attempt_id: id, confirmed: true },
				})
			).status,
		).toBe(403);
		await c.call(`/api/calendar/events/${e.id}/authorize`, {
			method: "POST",
			body: { confirmed: true, token_id: t.id },
		});
		expect(
			(
				await remote.json(`/api/calendar/events/${e.id}/claim`, {
					method: "POST",
					body: { attempt_id: id, confirmed: true },
				})
			).create_allowed,
		).toBe(true);
		expect((await remote.json(`/api/calendar/events/${e.id}/claim`, {
      method: "POST", body: { attempt_id: id, confirmed: true },
    })).create_allowed).toBe(false);
		expect(
			(
				await remote.call(`/api/calendar/events/${e.id}/claim`, {
					method: "POST",
					body: { attempt_id: crypto.randomUUID(), confirmed: true },
				})
			).status,
		).toBe(409);
		expect(
			(
				await remote.json(`/api/calendar/events/${e.id}/ack`, {
					method: "POST",
					body: {
						attempt_id: id,
						status: "created",
						external_id: "synthetic-apple-id",
						calendar_name: "PRUEBAS",
					},
				})
			).event.apple_status,
		).toBe("created");
		expect(
			(
				await remote.json(`/api/calendar/events/${e.id}/claim`, {
					method: "POST",
					body: { attempt_id: id, confirmed: true },
				})
			).create_allowed,
		).toBe(false);
	});
});

describe("migración V2 y rearmado anual", () => {
	it("mantiene sesiones, suscripciones push y datos V2 al aplicar la migración aditiva", async () => {
		const c = await loggedIn();
		const note = (
			await c.json("/api/notes", {
				method: "POST",
				body: { title: unique(), content: "Solo prueba de migración" },
			})
		).note;
		await inAgent((a) => {
			const s = a.services,
				db = s.db;
			const sessions = db.all("SELECT * FROM tal_sessions ORDER BY id");
			const pushId = crypto.randomUUID();
			db.run(
				`INSERT INTO tal_push_subscriptions(id,endpoint,p256dh,auth,label,origin,created_at) VALUES(?,?,?,?,?,?,?)`,
				pushId,
				`https://example.com/${pushId}`,
				"synthetic-key",
				"synthetic-auth",
				"PRUEBA",
				"https://example.com",
				new Date().toISOString(),
			);
			const subscriptions = db.all(
				"SELECT * FROM tal_push_subscriptions ORDER BY id",
			);
			// Reconstruct schema 12, preserving its data and authentication. V3-only test rows are disposable.
			for (const table of [
				"tal_saved_preview_chunks",
				"tal_saved_previews",
				"tal_calendar_exports",
				"tal_captures",
				"tal_calendar_events",
				"tal_saved_links",
				"tal_birthdays",
				"tal_list_items",
				"tal_lists",
			])
				db.run(`DROP TABLE ${table}`);
			db.run("ALTER TABLE tal_remote_tokens DROP COLUMN capability");
			db.run("UPDATE tal_schema SET version=12 WHERE id=1");
			const beforeNote = s.notes.get(note.id);
			expect(migrate(db)).toBe(LATEST_SCHEMA_VERSION);
			expect(migrate(db)).toBe(LATEST_SCHEMA_VERSION);
			expect(db.all("SELECT * FROM tal_sessions ORDER BY id")).toEqual(
				sessions,
			);
			expect(
				db.all("SELECT * FROM tal_push_subscriptions ORDER BY id"),
			).toEqual(subscriptions);
			expect(s.notes.get(note.id)).toEqual(beforeNote);
			db.run("DELETE FROM tal_push_subscriptions WHERE id=?", pushId);
		});
		expect((await c.call(`/api/notes/${note.id}`)).status).toBe(200);
	});
	it("al ejecutarse el aviso anual programa el año siguiente y descarta el callback repetido", async () => {
		await inAgent(async (a) => {
			const s = a.services;
			const b = await s.bicho.saveBirthday({
				name: unique(),
				month: 5,
				day: 18,
			});
			const original = s.automations.get(b.automation_id!)!;
			let count = 0;
			await s.automations.fire(original.id, original.schedule_id!, async () => {
				count++;
				return { status: "success", result: "Aviso de prueba" };
			});
			const next = s.automations.get(original.id)!;
			expect(new Date(next.next_run!).getUTCFullYear()).toBe(
				new Date(original.next_run!).getUTCFullYear() + 1,
			);
			await s.automations.fire(original.id, original.schedule_id!, async () => {
				count++;
				return { status: "success", result: "No debe ejecutarse" };
			});
			expect(count).toBe(1);
			await s.bicho.deleteBirthday(b.id);
		});
	});
	it("las altas simultáneas de un mismo cumpleaños no dejan dos alarmas", async () => {
		await inAgent(async (a) => {
			const name = unique();
			const results = await Promise.all(
				[1, 2, 3].map(() =>
					a.services.bicho.saveBirthday({ name, day: 10, month: 6 }),
				),
			);
			expect(new Set(results.map((b) => b.id)).size).toBe(1);
			const schedules = (await a.listSchedules()).filter(
				(s) =>
					(s.payload as { automationId?: string })?.automationId ===
					results[0]!.automation_id,
			);
			expect(schedules).toHaveLength(1);
			await a.services.bicho.deleteBirthday(results[0]!.id);
		});
	});
});
