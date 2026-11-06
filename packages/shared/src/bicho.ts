import { z } from "zod";
import { isValidCalendarDate } from "./recurrence";

const name = z.string().trim().min(1).max(200);
export const listCreateSchema = z.object({
	name,
	items: z.array(name).max(200).default([]),
});
export const listUpdateSchema = z.object({ name });
export const listItemsSchema = z.object({
	items: z.array(name).min(1).max(200),
});
export const listItemUpdateSchema = z
	.object({ text: name.optional(), completed: z.boolean().optional() })
	.refine(
		(v) => v.text !== undefined || v.completed !== undefined,
		"Indica el cambio.",
	);
export const listOrderSchema = z.object({
	ids: z.array(z.string().uuid()).max(500),
});
export interface ChecklistItem {
	id: string;
	list_id: string;
	text: string;
	completed: boolean;
	position: number;
	created_at: string;
	updated_at: string;
}
export interface Checklist {
	id: string;
	name: string;
	created_at: string;
	updated_at: string;
	items: ChecklistItem[];
}
export const birthdaySchema = z
	.object({
		name,
		month: z.number().int().min(1).max(12),
		day: z.number().int().min(1).max(31),
		birth_year: z.number().int().min(1).max(9999).nullable().optional(),
		notes: z.string().max(2000).default(""),
	})
	.refine(
		(v) => isValidCalendarDate(v.birth_year ?? 2000, v.month, v.day),
		"Fecha de cumpleaños no válida.",
	);
export interface Birthday {
	id: string;
	name: string;
	month: number;
	day: number;
	birth_year: number | null;
	notes: string;
	automation_id: string | null;
	created_at: string;
	updated_at: string;
	next_run?: string | null;
	notification_status?: string;
}
export const birthdaySettingsSchema = z.object({
	time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
});
const webUrl = z
	.string()
	.max(4000)
	.url()
	.refine((v) => /^https?:\/\//i.test(v), "Usa un enlace http o https.");
export const savedLinkSchema = z.object({
	title: name,
	url: webUrl,
	price: z.string().max(100).default(""),
	image_url: webUrl.or(z.literal("")).default(""),
	comments: z.string().max(10000).default(""),
});
export interface SavedLink {
	note_id: string;
	url: string;
	price: string;
	image_url: string;
	comments: string;
	updated_at: string;
}
export const calendarEventSchema = z.object({
	title: name,
	start: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
	end: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
	notes: z.string().max(4000).default(""),
});
export interface BichoEvent {
	id: string;
	title: string;
	start_at: string;
	end_at: string;
	timezone: string;
	notes: string;
	sync_key: string;
	apple_status: "pending" | "claimed" | "created" | "error";
	apple_id: string | null;
	calendar_name: string | null;
	created_at: string;
	updated_at: string;
}
export const calendarClaimSchema = z.object({
	confirmed: z.literal(true),
	attempt_id: z.string().uuid(),
});
export const calendarAckSchema = z.object({
	attempt_id: z.string().uuid(),
	status: z.enum(["created", "error"]),
	external_id: z.string().max(1000).optional(),
	calendar_name: z.string().max(200).optional(),
});
export const captureSchema = z
	.object({
		request_id: z.string().uuid(),
		text: z.string().trim().min(1).max(8000),
	})
	.strict();
export interface CaptureResult {
	id: string;
	status: "running" | "complete" | "needs_input" | "error";
	message: string;
	actions: { tool: string; confirmation: string }[];
	calendar_events: BichoEvent[];
}
