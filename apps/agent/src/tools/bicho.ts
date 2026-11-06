import { calendarTimingQuestion } from "../bicho/calendar-intent";
import {
	birthdaySchema,
	calendarEventSchema,
	listCreateSchema,
	listItemsSchema,
	listItemUpdateSchema,
	savedLinkSchema,
} from "@talorys/shared";
import { z } from "zod";
import { defineTool } from "./registry";
const ref = z.string().min(1).max(200);
export const bichoTools = [
	defineTool({
		name: "create_list",
		description:
			"Crea una lista marcable (compra, viaje, películas, libros o personalizada) con todos sus elementos. Reutiliza el mismo nombre y no duplica elementos. NO crea tareas ni fechas.",
		permission: "write",
		input: listCreateSchema,
		label: (i) => `Lista · ${i.name}`,
		execute: (i, c) => {
			const list = c.services.bicho.createList(i);
			return {
				list,
				confirmation: `Guardado en Listas · ${list.name} · ${list.items.length} elementos`,
			};
		},
	}),
	defineTool({
		name: "find_lists",
		description:
			"Consulta las listas existentes para elegir inequívocamente una lista antes de añadir o marcar elementos. Si dos nombres encajan, pregunta.",
		permission: "read",
		input: z.object({ name: ref.optional() }),
		label: () => "Consultar listas",
		execute: (i, c) => ({
			lists: i.name
				? [c.services.bicho.list(i.name)]
				: c.services.bicho.lists(),
		}),
	}),
	defineTool({
		name: "add_list_items",
		description:
			"Añade elementos a una lista existente por su id o nombre exacto. No crea duplicados y no desmarca elementos ya completados.",
		permission: "write",
		input: listItemsSchema.extend({ list: ref }),
		label: () => "Añadir a la lista",
		execute: (i, c) => {
			const list = c.services.bicho.addItems(i.list, i.items);
			return { list, confirmation: `Guardado en Listas · ${list.name}` };
		},
	}),
	defineTool({
		name: "update_list_item",
		description:
			"Marca, desmarca o corrige el texto de un elemento existente. Resuelve su id consultando la lista; nunca inventes un id.",
		permission: "write",
		input: listItemUpdateSchema.and(z.object({ id: ref })),
		label: () => "Actualizar elemento",
		execute: (i, c) => {
			const item = c.services.bicho.updateItem(i.id, i);
			return {
				item,
				confirmation: `${item.completed ? "Marcado" : "Actualizado"} en Listas · ${item.text}`,
			};
		},
	}),
	defineTool({
		name: "rename_list",
		description:
			"Cambia el nombre de una lista existente conservando sus elementos y casillas.",
		permission: "write",
		input: z.object({ list: ref, name: ref }),
		label: () => "Renombrar lista",
		execute: (i, c) => {
			const list = c.services.bicho.renameList(i.list, i.name);
			return { list, confirmation: `Lista renombrada · ${list.name}` };
		},
	}),
	defineTool({
		name: "reorder_list",
		description:
			"Reordena una lista existente. Consulta primero find_lists y proporciona TODOS sus ids de elementos una sola vez, en el orden pedido. No elimina ni marca elementos.",
		permission: "write",
		input: z.object({ list: ref, ids: z.array(z.string().uuid()).max(500) }),
		label: () => "Reordenar lista",
		execute: (i, c) => {
			const list = c.services.bicho.reorder(i.list, i.ids);
			return { list, confirmation: `Lista reordenada · ${list.name}` };
		},
	}),
	defineTool({
		name: "delete_list",
		description:
			"Propone borrar una lista y sus elementos. Solo se borra cuando el propietario confirma en la aplicación.",
		permission: "destructive",
		input: z.object({ list: ref }),
		label: () => "Proponer eliminar lista",
		prepare: (i, c) => {
			const l = c.services.bicho.list(i.list);
			return {
				targetId: l.id,
				summary: `Eliminar lista «${l.name}» y sus ${l.items.length} elementos`,
			};
		},
		snapshot: (id, c) => {
			try {
				return c.services.bicho.list(id);
			} catch {
				return null;
			}
		},
		commit: (id, c) => c.services.bicho.deleteList(id),
	}),
	defineTool({
		name: "delete_list_item",
		description:
			"Propone borrar un elemento. Requiere confirmación en la aplicación antes de eliminarlo.",
		permission: "destructive",
		input: z.object({ id: ref }),
		label: () => "Proponer eliminar elemento",
		prepare: (i, c) => ({
			targetId: i.id,
			summary: `Eliminar «${c.services.bicho.item(i.id).text}»`,
		}),
		snapshot: (id, c) => {
			try {
				return c.services.bicho.item(id);
			} catch {
				return null;
			}
		},
		commit: (id, c) => c.services.bicho.deleteItem(id),
	}),
	defineTool({
		name: "save_birthday",
		description:
			"Guarda una persona y su cumpleaños estructurado; crea automáticamente UN aviso ANUAL a las 11:00 Europe/Madrid (o la hora configurada). No hace falta solicitar otro recordatorio. No inventes año de nacimiento. Una fecha distinta para un nombre existente exige aclarar/corregir explícitamente. 29 febrero: 28 febrero en años no bisiestos.",
		permission: "write",
		input: birthdaySchema,
		label: (i) => `Cumpleaños · ${i.name}`,
		execute: async (i, c) => {
			const birthday = await c.services.bicho.saveBirthday(i);
			return {
				birthday,
				confirmation: `Guardado en Personas · Cumpleaños de ${birthday.name} · ${birthday.day}/${birthday.month} · aviso anual ${c.services.bicho.birthdayTime()}`,
			};
		},
	}),
	defineTool({
		name: "find_birthdays",
		description:
			"Consulta las personas y cumpleaños estructurados para localizar uno o resolver una corrección explícita.",
		permission: "read",
		input: z.object({}),
		label: () => "Consultar cumpleaños",
		execute: (_i, c) => ({ birthdays: c.services.bicho.birthdays() }),
	}),
	defineTool({
		name: "update_birthday",
		description:
			"Corrige un cumpleaños SOLO si el propietario ha indicado claramente la persona y la fecha nueva. Actualiza el mismo aviso anual, sin duplicarlo.",
		permission: "write",
		input: birthdaySchema.and(z.object({ id: ref })),
		label: () => "Actualizar cumpleaños",
		execute: async (i, c) => {
			const birthday = await c.services.bicho.saveBirthday(i, i.id);
			return {
				birthday,
				confirmation: `Cumpleaños actualizado · ${birthday.name} · ${birthday.day}/${birthday.month}`,
			};
		},
	}),
	defineTool({
		name: "delete_birthday",
		description:
			"Propone eliminar un cumpleaños y cancelar su aviso anual. Requiere confirmación del propietario en la aplicación.",
		permission: "destructive",
		input: z.object({ id: ref }),
		label: () => "Proponer eliminar cumpleaños",
		prepare: (i, c) => ({
			targetId: i.id,
			summary: `Eliminar cumpleaños de ${c.services.bicho.birthday(i.id).name} y cancelar su aviso anual`,
		}),
		snapshot: (id, c) => {
			try {
				const b = c.services.bicho.birthday(id);
				return [b.name, b.month, b.day, b.birth_year, b.notes, b.automation_id];
			} catch {
				return null;
			}
		},
		commit: (id, c) => c.services.bicho.deleteBirthday(id),
	}),
	defineTool({
		name: "save_link",
		description:
			"Guarda un producto, lugar, favorito o enlace en Guardado con su URL ORIGINAL exacta, precio, fotografía por URL y comentarios opcionales. Nunca inventes ni visites enlaces. Si falta la URL, pregunta. No duplica la misma URL.",
		permission: "write",
		input: savedLinkSchema,
		label: (i) => `Guardar · ${i.title}`,
		execute: (i, c) => {
			const saved = c.services.bicho.saveLink(i);
			return {
				...saved,
				confirmation: `${saved.existing ? "Ya estaba guardado" : "Guardado"} en Guardado · ${saved.note.title}`,
			};
		},
	}),
	defineTool({
		name: "create_calendar_event",
		description:
			"Guarda un evento con inicio y fin en BichO. NO crea nada en Apple Calendar. Fecha/hora ambiguas (p. ej. a las cinco sin mañana/tarde) o duración no indicada: pregunta primero. Atajos solicitará autorización para crearlo en Calendario.",
		permission: "write",
		input: calendarEventSchema,
		label: (i) => `Evento · ${i.title}`,
		execute: (i, c) => {
			const question = calendarTimingQuestion(c.ownerInput, i.start, i.end);
			if (question) return { question };
			const event = c.services.bicho.createEvent(i);
			return {
				event,
				confirmation: `Evento guardado en BichO · ${event.title}. Apple Calendar pendiente de autorización desde Atajos.`,
			};
		},
	}),
	defineTool({
		name: "ask_clarification",
		description:
			"Pide un dato esencial que falta o es ambiguo antes de guardar: persona, fecha, mañana/tarde, duración, enlace o lista de destino. No realiza ninguna escritura.",
		permission: "read",
		input: z.object({ question: z.string().min(1).max(500) }),
		label: () => "Falta un dato",
		execute: (i) => ({ question: i.question }),
	}),
];
