import {
	birthdaySchema,
	calendarEventSchema,
	listCreateSchema,
	listItemUpdateSchema,
	savedLinkSchema,
	scheduleSpecSchema,
	type Birthday,
	type BichoEvent,
	type Checklist,
	type ChecklistItem,
	type SavedLink,
	type ScheduleSpec,
} from "@talorys/shared";
import type { z } from "zod";
import { type Database, newId, now } from "../db/database";
import { AppError, NotFoundError, ValidationError } from "../api/errors";
import type { AutomationService } from "../agent/scheduling";
import type { AutomationRepository } from "../db/repositories/automations";
import type { NoteRepository } from "../db/repositories/notes";
import type { SettingsService } from "../services/settings";
import { parseLocalDateTime } from "../services/time";

export const normalizeName = (s: string) =>
	s.trim().normalize("NFKC").toLocaleLowerCase("es").replace(/\s+/g, " ");
const cleanName = (s: string) => {
	const v = s.trim();
	if (!v || v.length > 200)
		throw new ValidationError("El nombre debe tener entre 1 y 200 caracteres.");
	return v;
};
const conflict = (message: string): never => {
	throw new AppError("CONFLICT", message);
};

export class BichoService {
	private birthdayQueue: Promise<unknown> = Promise.resolve();
	private serializeBirthday<T>(fn: () => Promise<T>): Promise<T> {
		const work = this.birthdayQueue.then(fn);
		this.birthdayQueue = work.catch(() => {});
		return work;
	}
	constructor(
		readonly db: Database,
		private readonly automations: AutomationService,
		private readonly repo: AutomationRepository,
		private readonly notes: NoteRepository,
		private readonly settings: SettingsService,
	) {}

	lists(): Checklist[] {
		return this.db
			.all<Omit<Checklist, "items">>(
				`SELECT id,name,created_at,updated_at FROM tal_lists ORDER BY updated_at DESC`,
			)
			.map((l) => ({ ...l, items: this.items(l.id) }));
	}
	items(listId: string): ChecklistItem[] {
		return this.db
			.all<Omit<ChecklistItem, "completed"> & { completed: number }>(
				`SELECT id,list_id,text,completed,position,created_at,updated_at FROM tal_list_items WHERE list_id=? ORDER BY position,id`,
				listId,
			)
			.map((i) => ({ ...i, completed: !!i.completed }));
	}
	list(ref: string): Checklist {
		const row = this.db.one<Omit<Checklist, "items">>(
			`SELECT id,name,created_at,updated_at FROM tal_lists WHERE id=? OR name_key=?`,
			ref,
			normalizeName(ref),
		);
		if (!row)
			throw new NotFoundError(
				"No encuentro esa lista. Indica su nombre exacto.",
			);
		return { ...row, items: this.items(row.id) };
	}
	createList(raw: z.input<typeof listCreateSchema>): Checklist {
		const input = listCreateSchema.parse(raw);
		return this.db.transaction(() => {
			let row = this.db.one<{ id: string }>(
				`SELECT id FROM tal_lists WHERE name_key=?`,
				normalizeName(input.name),
			);
			if (!row) {
				if (
					(this.db.one<{ n: number }>(`SELECT count(*) n FROM tal_lists`)?.n ??
						0) >= 200
				)
					throw new ValidationError("Se ha alcanzado el límite de 200 listas.");
				row = { id: newId() };
				const ts = now();
				this.db.run(
					`INSERT INTO tal_lists (id,name,name_key,created_at,updated_at) VALUES (?,?,?,?,?)`,
					row.id,
					input.name,
					normalizeName(input.name),
					ts,
					ts,
				);
			}
			return this.addItems(row.id, input.items);
		});
	}
	renameList(ref: string, name: string): Checklist {
		const list = this.list(ref);
		name = cleanName(name);
		if (
			this.db.one(
				`SELECT 1 FROM tal_lists WHERE name_key=? AND id<>?`,
				normalizeName(name),
				list.id,
			)
		)
			conflict("Ya existe una lista con ese nombre.");
		this.db.run(
			`UPDATE tal_lists SET name=?,name_key=?,updated_at=? WHERE id=?`,
			name,
			normalizeName(name),
			now(),
			list.id,
		);
		return this.list(list.id);
	}
	addItems(ref: string, texts: string[]): Checklist {
		const list = this.list(ref);
		const normalized = texts.map(cleanName);
		return this.db.transaction(() => {
			let position = this.db.one<{ n: number }>(
				`SELECT coalesce(max(position),-1)+1 n FROM tal_list_items WHERE list_id=?`,
				list.id,
			)!.n;
			const count = list.items.length;
			const distinct = new Set(
				normalized
					.map(normalizeName)
					.filter((k) => !list.items.some((i) => normalizeName(i.text) === k)),
			);
			if (count + distinct.size > 500)
				throw new ValidationError("Una lista puede tener hasta 500 elementos.");
			for (const text of normalized) {
				const ts = now();
				this.db.run(
					`INSERT INTO tal_list_items (id,list_id,text,text_key,completed,position,created_at,updated_at) VALUES (?,?,?,?,0,?,?,?) ON CONFLICT(list_id,text_key) DO NOTHING`,
					newId(),
					list.id,
					text,
					normalizeName(text),
					position++,
					ts,
					ts,
				);
			}
			this.db.run(
				`UPDATE tal_lists SET updated_at=? WHERE id=?`,
				now(),
				list.id,
			);
			return this.list(list.id);
		});
	}
	item(id: string): ChecklistItem {
		const row = this.db.one<ChecklistItem>(
			`SELECT * FROM tal_list_items WHERE id=?`,
			id,
		);
		if (!row) throw new NotFoundError("No encuentro ese elemento.");
		return { ...row, completed: !!row.completed };
	}
	updateItem(
		id: string,
		raw: z.input<typeof listItemUpdateSchema>,
	): ChecklistItem {
		const p = listItemUpdateSchema.parse(raw);
		const old = this.item(id);
		const text = p.text ?? old.text;
		if (
			this.db.one(
				`SELECT 1 FROM tal_list_items WHERE list_id=? AND text_key=? AND id<>?`,
				old.list_id,
				normalizeName(text),
				id,
			)
		)
			conflict("Ese elemento ya está en la lista.");
		this.db.transaction(() => {
			this.db.run(
				`UPDATE tal_list_items SET text=?,text_key=?,completed=?,updated_at=? WHERE id=?`,
				text,
				normalizeName(text),
				p.completed ?? old.completed,
				now(),
				id,
			);
			this.db.run(
				`UPDATE tal_lists SET updated_at=? WHERE id=?`,
				now(),
				old.list_id,
			);
		});
		return this.item(id);
	}
	reorder(ref: string, ids: string[]): Checklist {
		const list = this.list(ref);
		if (
			new Set(ids).size !== ids.length ||
			ids.length !== list.items.length ||
			ids.some((id) => !list.items.some((i) => i.id === id))
		)
			throw new ValidationError(
				"El orden debe incluir todos los elementos de la lista una sola vez. Actualiza e inténtalo de nuevo.",
			);
		this.db.transaction(() => {
			ids.forEach((id, i) => {
				this.db.run(
					`UPDATE tal_list_items SET position=?,updated_at=? WHERE id=? AND list_id=?`,
					i,
					now(),
					id,
					list.id,
				);
			});
			this.db.run(
				`UPDATE tal_lists SET updated_at=? WHERE id=?`,
				now(),
				list.id,
			);
		});
		return this.list(list.id);
	}
	deleteItem(id: string) {
		const item = this.item(id);
		this.db.run(`DELETE FROM tal_list_items WHERE id=?`, id);
		this.db.run(
			`UPDATE tal_lists SET updated_at=? WHERE id=?`,
			now(),
			item.list_id,
		);
	}
	deleteList(id: string) {
		const list = this.list(id);
		this.db.transaction(() => {
			this.db.run(`DELETE FROM tal_list_items WHERE list_id=?`, list.id);
			this.db.run(`DELETE FROM tal_lists WHERE id=?`, list.id);
		});
	}

	birthdayTime(): string {
		return this.settings.getJson<string>("bicho.birthdayTime") ?? "11:00";
	}
	birthdays(): Birthday[] {
		return this.db.all<Birthday>(
			`SELECT b.*,a.next_run,a.status notification_status FROM tal_birthdays b LEFT JOIN tal_automations a ON a.id=b.automation_id ORDER BY a.next_run IS NULL,a.next_run,b.name`,
		);
	}
	birthday(id: string): Birthday {
		const b = this.birthdays().find((b) => b.id === id);
		if (!b) throw new NotFoundError("No encuentro ese cumpleaños.");
		return b;
	}
	saveBirthday(
		raw: z.input<typeof birthdaySchema>,
		id?: string,
	): Promise<Birthday> {
		return this.serializeBirthday(() => this.saveBirthdayLocked(raw, id));
	}
	private async saveBirthdayLocked(
		raw: z.input<typeof birthdaySchema>,
		id?: string,
	): Promise<Birthday> {
		const input = birthdaySchema.parse(raw);
		const existing = id
			? this.birthday(id)
			: this.db.one<Birthday>(
					`SELECT * FROM tal_birthdays WHERE name_key=?`,
					normalizeName(input.name),
				);
		if (
			!id &&
			existing &&
			(existing.month !== input.month ||
				existing.day !== input.day ||
				(input.birth_year != null &&
					existing.birth_year != null &&
					input.birth_year !== existing.birth_year))
		)
			conflict(
				"Esta persona ya tiene otro cumpleaños. Confirma a qué persona te refieres y qué fecha quieres corregir antes de editarla.",
			);
		if (
			this.db.one(
				`SELECT 1 FROM tal_birthdays WHERE name_key=? AND id<>?`,
				normalizeName(input.name),
				existing?.id ?? "",
			)
		)
			conflict(
				"Hay otra persona con ese nombre. Usa un nombre que permita distinguirlas.",
			);
		const schedule: ScheduleSpec = {
			type: "yearly",
			month: input.month,
			day: input.day,
			time: this.birthdayTime(),
			timezone: "Europe/Madrid",
		};
		const name = `Cumpleaños de ${input.name}`;
		const message = `🎂 Hoy es el cumpleaños de ${input.name}`;
		const b = this.db.transaction(() => {
			const automation = existing?.automation_id
				? this.repo.get(existing.automation_id)
				: null;
			const aid =
				automation?.id ??
				this.repo.create({
					name,
					message,
					kind: "reminder",
					schedule,
					enabled: true,
				}).id;
			const bid = existing?.id ?? newId();
			const ts = now();
			this.db.run(
				`INSERT INTO tal_birthdays (id,name,name_key,month,day,birth_year,notes,automation_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,name_key=excluded.name_key,month=excluded.month,day=excluded.day,birth_year=excluded.birth_year,notes=excluded.notes,automation_id=excluded.automation_id,updated_at=excluded.updated_at`,
				bid,
				input.name,
				normalizeName(input.name),
				input.month,
				input.day,
				input.birth_year === undefined
					? (existing?.birth_year ?? null)
					: input.birth_year,
				existing && !id ? existing.notes : input.notes,
				aid,
				existing?.created_at ?? ts,
				ts,
			);
			return { id: bid, automation_id: aid };
		});
		// The durable record/link exists before awaiting the scheduler. A retry repairs this same
		// automation if scheduling fails; it never creates a second birthday notification.
		await this.automations.update(b.automation_id, {
			name,
			message,
			schedule,
			enabled: true,
		});
		const saved = this.birthday(b.id);
		if (!saved.next_run)
			throw new AppError(
				"INTERNAL_ERROR",
				"La persona está guardada, pero no se pudo programar el aviso. Vuelve a intentarlo para reparar el mismo recordatorio.",
			);
		return saved;
	}
	deleteBirthday(id: string) {
		return this.serializeBirthday(() => this.deleteBirthdayLocked(id));
	}
	private async deleteBirthdayLocked(id: string) {
		const b = this.birthday(id);
		if (b.automation_id && this.repo.get(b.automation_id))
			await this.automations.delete(b.automation_id);
		this.db.run(`DELETE FROM tal_birthdays WHERE id=?`, id);
	}
	async setBirthdayTime(time: string) {
		this.settings.setJson("bicho.birthdayTime", time);
		for (const b of this.birthdays()) await this.saveBirthday(b, b.id);
	}
	saved(): SavedLink[] {
		return this.db.all<SavedLink>(
			`SELECT * FROM tal_saved_links ORDER BY updated_at DESC`,
		);
	}
	saveLink(raw: z.input<typeof savedLinkSchema>) {
		const v = savedLinkSchema.parse(raw);
		return this.db.transaction(() => {
			const old = this.db.one<SavedLink>(
				`SELECT * FROM tal_saved_links WHERE url=?`,
				v.url,
			);
			if (old)
				return {
					note: this.notes.require(old.note_id),
					details: old,
					existing: true,
				};
			const note = this.notes.create({
				title: v.title,
				content: `#personal-space/guardado\n${v.url}\n${v.comments}`,
			});
			this.db.run(
				`INSERT INTO tal_saved_links (note_id,url,price,image_url,comments,updated_at) VALUES (?,?,?,?,?,?)`,
				note.id,
				v.url,
				v.price,
				v.image_url,
				v.comments,
				now(),
			);
			return {
				note,
				details: this.saved().find((s) => s.note_id === note.id)!,
				existing: false,
			};
		});
	}
	updateSaved(noteId: string, raw: z.input<typeof savedLinkSchema>) {
		const v = savedLinkSchema.parse(raw);
		this.notes.require(noteId);
		if (
			this.db.one(
				`SELECT 1 FROM tal_saved_links WHERE url=? AND note_id<>?`,
				v.url,
				noteId,
			)
		)
			conflict("Ese enlace ya está guardado.");
		return this.db.transaction(() => {
			this.notes.update(noteId, {
				title: v.title,
				content: `#personal-space/guardado\n${v.url}\n${v.comments}`,
			});
			this.db.run(
				`INSERT INTO tal_saved_links (note_id,url,price,image_url,comments,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(note_id) DO UPDATE SET url=excluded.url,price=excluded.price,image_url=excluded.image_url,comments=excluded.comments,updated_at=excluded.updated_at`,
				noteId,
				v.url,
				v.price,
				v.image_url,
				v.comments,
				now(),
			);
			return this.notes.require(noteId);
		});
	}
	events(): BichoEvent[] {
		return this.db.all<BichoEvent>(
			`SELECT id,title,start_at,end_at,timezone,notes,sync_key,apple_status,apple_id,calendar_name,created_at,updated_at FROM tal_calendar_events ORDER BY start_at`,
		);
	}
	event(id: string): BichoEvent {
		const e = this.events().find((e) => e.id === id);
		if (!e) throw new NotFoundError("No encuentro ese evento.");
		return e;
	}
	createEvent(raw: z.input<typeof calendarEventSchema>, timezone?: string) {
		const v = calendarEventSchema.parse(raw);
		const tz = timezone ?? this.settings.get().timezone;
		scheduleSpecSchema.parse({ type: "once", at: v.start });
		scheduleSpecSchema.parse({ type: "once", at: v.end });
		const start = parseLocalDateTime(v.start, tz);
		const end = parseLocalDateTime(v.end, tz);
		if (!start || !end) throw new ValidationError("Fecha u hora no válida.");
		if (Date.parse(end) <= Date.parse(start))
			throw new ValidationError("El evento debe terminar después de comenzar.");
		const key = `${normalizeName(v.title)}|${start}|${end}`;
		const existing = this.db.one<{ id: string }>(
			`SELECT id FROM tal_calendar_events WHERE sync_key=?`,
			key,
		);
		if (existing) return this.event(existing.id);
		const id = newId();
		const ts = now();
		this.db.run(
			`INSERT INTO tal_calendar_events (id,title,start_at,end_at,timezone,notes,sync_key,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)`,
			id,
			v.title,
			start,
			end,
			tz,
			v.notes,
			key,
			ts,
			ts,
		);
		return this.event(id);
	}
	calendarForToken(tokenId: string): BichoEvent[] {
		const ids = new Set(
			this.db
				.all<{ event_id: string }>(
					`SELECT event_id FROM tal_calendar_exports WHERE token_id=?`,
					tokenId,
				)
				.map((r) => r.event_id),
		);
		return this.events().filter((e) => ids.has(e.id));
	}
	authorizeCalendar(id: string, tokenId: string) {
		this.event(id);
		if (
			!this.db.one(
				`SELECT 1 FROM tal_remote_tokens WHERE id=? AND capability='capture'`,
				tokenId,
			)
		)
			throw new ValidationError("Elige una conexión de Siri activa.");
		this.db.run(
			`INSERT INTO tal_calendar_exports(event_id,token_id) VALUES(?,?) ON CONFLICT DO NOTHING`,
			id,
			tokenId,
		);
	}
	assertCalendarAccess(id: string, tokenId?: string) {
		if (tokenId && !this.calendarForToken(tokenId).some((e) => e.id === id))
			throw new AppError(
				"FORBIDDEN",
				"Este evento no está autorizado para esta conexión.",
			);
	}
	prepareBirthdayCalendar(id: string) {
		const b = this.birthday(id);
		if (!b.next_run)
			throw new ValidationError(
				"Activa primero el aviso del cumpleaños para determinar la próxima fecha.",
			);
		const date = new Intl.DateTimeFormat("sv-SE", {
			timeZone: "Europe/Madrid",
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
		}).format(new Date(b.next_run));
		// Use explicit timezone without mutating the owner's setting.
		return this.createEvent(
			{
				title: `Cumpleaños de ${b.name}`,
				start: `${date}T11:00`,
				end: `${date}T11:15`,
				notes: `Próximo cumpleaños de ${b.name}. Copia de esta fecha; el aviso anual de BichO es independiente.`,
			},
			"Europe/Madrid",
		);
	}
	claimCalendar(id: string, attemptId: string) {
		const event = this.event(id);
		if (event.apple_status === "created")
			return { event, create_allowed: false, marker: `BichO:${id}` };
		const current = this.db.one<{ attempt_id: string | null }>(
			`SELECT attempt_id FROM tal_calendar_events WHERE id=?`,
			id,
		)!;
		if (event.apple_status === "claimed" && current.attempt_id !== attemptId)
			conflict(
				"Ya hay un envío de este evento a Calendario pendiente. Comprueba el calendario antes de reintentar.",
			);
		if (event.apple_status === "claimed")
			return {
				event,
				create_allowed: false,
				reconciliation_required: true,
				marker: `BichO:${id}`,
			};
		this.db.run(
			`UPDATE tal_calendar_events SET apple_status='claimed',attempt_id=?,updated_at=? WHERE id=?`,
			attemptId,
			now(),
			id,
		);
		return {
			event: this.event(id),
			create_allowed: true,
			marker: `BichO:${id}`,
		};
	}
	resetCalendar(id: string) {
		const e = this.event(id);
		if (e.apple_status !== "claimed" && e.apple_status !== "error")
			conflict("Solo puede recuperarse un envío pendiente o fallido.");
		this.db.run(
			`UPDATE tal_calendar_events SET apple_status='pending',attempt_id=NULL,updated_at=? WHERE id=?`,
			now(),
			id,
		);
		return this.event(id);
	}
	acknowledgeCalendar(
		id: string,
		input: {
			attempt_id: string;
			status: "created" | "error";
			external_id?: string;
			calendar_name?: string;
		},
	) {
		const e = this.event(id);
		const current = this.db.one<{ attempt_id: string | null }>(
			`SELECT attempt_id FROM tal_calendar_events WHERE id=?`,
			id,
		)!;
		if (current.attempt_id !== input.attempt_id)
			conflict("La confirmación no corresponde al envío autorizado.");
		if (e.apple_status === "created") return e;
		if (e.apple_status !== "claimed")
			conflict("No hay un envío autorizado pendiente.");
		this.db.run(
			`UPDATE tal_calendar_events SET apple_status=?,apple_id=?,calendar_name=?,updated_at=? WHERE id=?`,
			input.status,
			input.external_id ?? null,
			input.calendar_name ?? null,
			now(),
			id,
		);
		return this.event(id);
	}
}
