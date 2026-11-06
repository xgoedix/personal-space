import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import type {
	Birthday,
	BichoEvent,
	CaptureResult,
	ChatStreamEvent,
	Checklist,
	Note,
	Task,
} from "@talorys/shared";
import type { Manifest } from "./manifest";
import { assertV3Manifest } from "./v3-guard";

/** Real Workers AI + SQLite verification, restricted to the V3 installation. No credentials in output. */
export async function verifyV3(
	manifest: Manifest,
	password: string,
	log: (s: string) => void,
) {
	assertV3Manifest(manifest);
	assert(manifest.public_url);
	const base = manifest.public_url;
	const marker = `PRUEBA-V3-${randomBytes(4).toString("hex")}`;
	const checks: string[] = [];
	const pass = (s: string) => {
		checks.push(s);
		log(`✓ ${s}`);
	};
	let cookie = "";
	let remoteId = "";
	let token = "";
	async function call(
		path: string,
		method = "GET",
		data?: unknown,
		remote = false,
	) {
		const res = await fetch(`${base}/api${path}`, {
			method,
			redirect: "error",
			signal: AbortSignal.timeout(180_000),
			headers: {
				"content-type": "application/json",
				...(remote
					? { authorization: `Bearer ${token}` }
					: {
							origin: base,
							"x-talorys-request": "1",
							...(cookie ? { cookie } : {}),
						}),
			},
			...(data === undefined ? {} : { body: JSON.stringify(data) }),
		});
		if (!remote && res.headers.has("set-cookie"))
			cookie = res.headers.get("set-cookie")!.split(";")[0]!;
		return res;
	}
	async function json<T>(
		path: string,
		method = "GET",
		data?: unknown,
		remote = false,
	): Promise<T> {
		const r = await call(path, method, data, remote);
		assert(r.ok, `${method} ${path}: ${r.status}`);
		return r.json() as Promise<T>;
	}
	async function chat(message: string, expected: string[]) {
		const r = await call("/chat", "POST", { message });
		assert.equal(r.status, 200);
		const raw = await r.text();
		const events = raw.split("\n\n").flatMap((frame) => {
			const line = frame.split("\n").find((l) => l.startsWith("data:"));
			return line ? [JSON.parse(line.slice(5)) as ChatStreamEvent] : [];
		});
		const done = events.find((e) => e.type === "done");
		assert(
			done?.type === "done" && done.message.status === "complete",
			`Chat no completado: ${JSON.stringify(events.filter((e) => e.type === "error"))}`,
		);
		for (const name of expected)
			assert(
				events.some(
					(e) =>
						e.type === "tool" &&
						e.tool.name === name &&
						e.tool.status === "success",
				),
				`La IA no ejecutó ${name}. Respuesta: ${done.message.content}`,
			);
		return done.message;
	}
	try {
		for (const path of ["/lists", "/birthdays", "/calendar/events"])
			assert.equal((await call(path)).status, 401);
		assert.equal((await call("/auth/login", "POST", { password })).status, 200);
		pass(
			"Autenticación privada; listas, personas y eventos rechazan acceso anónimo",
		);
		const system = await json<{
			installation_id: string;
			ai_provider: string;
			environment: string;
		}>("/system");
		assert.equal(system.installation_id, manifest.installation_id);
		assert.equal(system.ai_provider, "workers-ai");
		assert.equal(system.environment, "production");
		const settings = await json<{
			settings: { demoMode: boolean; timezone: string };
		}>("/settings");
		assert.equal(settings.settings.demoMode, false);
		assert.equal(settings.settings.timezone, "Europe/Madrid");
		pass("Backend aislado correcto, Workers AI real y Europe/Madrid");
		await chat(
			`Crea una lista llamada Compra ${marker} con huevos, leche y café. Además crea una tarea para mañana llamada Comprar detergente ${marker}. No quiero notificación para esa tarea.`,
			["create_list", "create_task"],
		);
		let list = (await json<{ lists: Checklist[] }>("/lists")).lists.find((l) =>
			l.name.includes(marker),
		);
		assert(list && list.items.length === 3);
		const task = (await json<{ tasks: Task[] }>("/tasks")).tasks.find((t) =>
			t.title.includes(marker),
		);
		assert(task?.due_at);
		const autos = await json<{ automations: { name: string }[] }>(
			"/automations",
		);
		assert(!autos.automations.some((a) => a.name.includes("detergente")));
		pass(
			"Clasificación múltiple: lista real y tarea fechada sin aviso adicional",
		);
		await json(`/list-items/${list.items[0]!.id}`, "PATCH", {
			completed: true,
		});
		await call("/auth/logout", "POST");
		cookie = "";
		assert.equal((await call("/auth/login", "POST", { password })).status, 200);
		list = (await json<{ list: Checklist }>(`/lists/${list.id}`)).list;
		assert(list.items[0]!.completed);
		pass(
			"Casilla marcada conservada después de cerrar sesión e iniciar una nueva",
		);
		const again = await json<{ list: Checklist }>("/lists", "POST", {
			name: list.name,
			items: ["huevos", "leche", "café"],
		});
		assert.equal(again.list.id, list.id);
		assert.equal(again.list.items.length, 3);
		pass("Deduplicación persistente de listas y elementos");
		await chat(`El cumpleaños de Laura ${marker} es el 18 de mayo.`, [
			"save_birthday",
		]);
		const birthday = (
			await json<{ birthdays: Birthday[] }>("/birthdays")
		).birthdays.find((b) => b.name.includes(marker));
		assert(birthday?.next_run);
		assert.equal(birthday.birth_year, null);
		assert.equal(
			new Intl.DateTimeFormat("es-ES", {
				timeZone: "Europe/Madrid",
				hour: "2-digit",
				minute: "2-digit",
			}).format(new Date(birthday.next_run)),
			"11:00",
		);
		const twice = await json<{ birthday: Birthday }>("/birthdays", "POST", {
			name: birthday.name,
			day: 18,
			month: 5,
		});
		assert.equal(twice.birthday.automation_id, birthday.automation_id);
		pass(
			"IA guarda persona y cumpleaños sin año inventado; único aviso anual a las 11:00 Madrid",
		);
		await chat(
			`Guarda en Guardado este bolso ficticio ${marker}: https://example.com/bolso?prueba=${marker} . Precio 42 euros y comentario color azul.`,
			["save_link"],
		);
		const links = await json<{
			links: { url: string; price: string; comments: string }[];
		}>("/saved-links");
		assert(
			links.links.some(
				(l) =>
					l.url === `https://example.com/bolso?prueba=${marker}` &&
					l.price.includes("42"),
			),
		);
		pass("Enlace original y precio conservados en Guardado");
		const before = (await json<{ events: BichoEvent[] }>("/calendar/events"))
			.events.length;
		const unclear = await chat(`Tengo dentista el jueves a las cinco.`, []);
		assert(unclear.content.includes("¿"), "La respuesta debe pedir los datos ambiguos");
		assert.equal(
			(await json<{ events: BichoEvent[] }>("/calendar/events")).events.length,
			before,
		);
		pass("Fecha/hora ambigua: pregunta antes de guardar un evento");
		await json("/remote/status", "PATCH", { enabled: true });
		const connection = await json<{ token: { id: string; token: string } }>(
			"/remote/tokens",
			"POST",
			{ name: `Verificación ${marker}`, scope: "write", capability: "capture" },
		);
		remoteId = connection.token.id;
		token = connection.token.token;
		for (const path of ["/notes", "/settings", "/remote/tokens"])
			assert.equal((await call(path, "GET", undefined, true)).status, 403);
		const request = {
			request_id: randomUUID(),
			text: `Guarda una nota titulada Siri ${marker} que diga comprar un regalo. Además guarda un evento llamado Dentista ${marker} el 20 de noviembre de 2030 de 17:00 a 18:00.`,
		};
		let capture = await json<CaptureResult>("/capture", "POST", request, true);
		const deadline = Date.now() + 160_000;
		while (capture.status === "running" && Date.now() < deadline) {
			await delay(3000);
			capture = await json<CaptureResult>(
				`/capture/${request.request_id}`,
				"GET",
				undefined,
				true,
			);
		}
		assert.equal(capture.status, "complete", capture.message);
		assert(capture.actions.some((a) => a.tool === "create_note"));
		assert(capture.actions.some((a) => a.tool === "create_calendar_event"));
		const note = (await json<{ notes: Note[] }>("/notes")).notes.find(
			(n) => n.title === `Siri ${marker}`,
		);
		assert(note);
		const replay = await json<CaptureResult>("/capture", "POST", request, true);
		assert.deepEqual(replay, capture);
		assert.equal(
			(await json<{ notes: Note[] }>("/notes")).notes.filter(
				(n) => n.title === `Siri ${marker}`,
			).length,
			1,
		);
		pass(
			"API de Siri ejecuta Workers AI y persiste nota/evento; reintento idéntico no repite acciones",
		);
		const event = capture.calendar_events[0];
		assert(event && event.apple_status === "pending");
		assert.equal(
			(
				await call(
					`/calendar/events/${event.id}/claim`,
					"POST",
					{ attempt_id: randomUUID() },
					true,
				)
			).status,
			400,
		);
		pass(
			"Evento permanece en BichO; Apple Calendar exige autorización explícita (sin simular creación)",
		);
		await json(`/remote/tokens/${remoteId}`, "DELETE");
		remoteId = "";
		assert.equal(
			(await call(`/capture/${request.request_id}`, "GET", undefined, true))
				.status,
			401,
		);
		pass("Token específico revocado deja de funcionar inmediatamente");
		const exported = await json<Record<string, unknown>>("/export");
		assert(exported);
		pass("Exportación autenticada disponible");
		return {
			tested_at: new Date().toISOString(),
			url: base,
			marker,
			checks,
			manual: [
				"Instalar preview V3 en iPhone y activar push de este entorno independiente.",
				"Configurar y ejecutar Apunta en Bicho por Siri, con PWA cerrada.",
				"Autorizar Calendario y comprobar creación, rechazo de permiso y reintento sin duplicados.",
			],
			limitations: [
				"La copia a Apple Calendar de cumpleaños prepara únicamente la próxima fecha; el aviso anual de BichO es independiente.",
			],
		};
	} finally {
		if (remoteId)
			await call(`/remote/tokens/${remoteId}`, "DELETE").catch(() => {});
		token = "";
		if (cookie) await call("/auth/logout", "POST").catch(() => {});
		cookie = "";
		password = "";
	}
}
