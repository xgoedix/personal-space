import {
	birthdaySchema,
	birthdaySettingsSchema,
	calendarAckSchema,
	calendarClaimSchema,
	calendarEventSchema,
	listCreateSchema,
	listItemsSchema,
	listItemUpdateSchema,
	listOrderSchema,
	listUpdateSchema,
	savedLinkSchema,
} from "@talorys/shared";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../api/app";
import { body } from "../api/middleware";
export const bichoRoutes = new Hono<AppEnv>();
const confirmation = z.object({ confirm: z.literal(true) });
bichoRoutes.get("/lists", (c) =>
	c.json({ lists: c.env.agent.services.bicho.lists() }),
);
bichoRoutes.post("/lists", async (c) =>
	c.json(
		{
			list: c.env.agent.services.bicho.createList(
				await body(c, listCreateSchema),
			),
		},
		201,
	),
);
bichoRoutes.get("/lists/:id", (c) =>
	c.json({ list: c.env.agent.services.bicho.list(c.req.param("id")) }),
);
bichoRoutes.patch("/lists/:id", async (c) =>
	c.json({
		list: c.env.agent.services.bicho.renameList(
			c.req.param("id"),
			(await body(c, listUpdateSchema)).name,
		),
	}),
);
bichoRoutes.delete("/lists/:id", async (c) => {
	await body(c, confirmation);
	c.env.agent.services.bicho.deleteList(c.req.param("id"));
	return c.json({ deleted: true });
});
bichoRoutes.post("/lists/:id/items", async (c) =>
	c.json({
		list: c.env.agent.services.bicho.addItems(
			c.req.param("id"),
			(await body(c, listItemsSchema)).items,
		),
	}),
);
bichoRoutes.put("/lists/:id/order", async (c) =>
	c.json({
		list: c.env.agent.services.bicho.reorder(
			c.req.param("id"),
			(await body(c, listOrderSchema)).ids,
		),
	}),
);
bichoRoutes.patch("/list-items/:id", async (c) =>
	c.json({
		item: c.env.agent.services.bicho.updateItem(
			c.req.param("id"),
			await body(c, listItemUpdateSchema),
		),
	}),
);
bichoRoutes.delete("/list-items/:id", async (c) => {
	await body(c, confirmation);
	c.env.agent.services.bicho.deleteItem(c.req.param("id"));
	return c.json({ deleted: true });
});
bichoRoutes.get("/birthdays", (c) =>
	c.json({
		birthdays: c.env.agent.services.bicho.birthdays(),
		time: c.env.agent.services.bicho.birthdayTime(),
		timezone: "Europe/Madrid",
		leap_day: "feb28",
	}),
);
bichoRoutes.post("/birthdays", async (c) =>
	c.json(
		{
			birthday: await c.env.agent.services.bicho.saveBirthday(
				await body(c, birthdaySchema),
			),
		},
		201,
	),
);
bichoRoutes.patch("/birthdays/:id", async (c) =>
	c.json({
		birthday: await c.env.agent.services.bicho.saveBirthday(
			await body(c, birthdaySchema),
			c.req.param("id"),
		),
	}),
);
bichoRoutes.delete("/birthdays/:id", async (c) => {
	await body(c, confirmation);
	await c.env.agent.services.bicho.deleteBirthday(c.req.param("id"));
	return c.json({ deleted: true });
});
bichoRoutes.get("/birthday-settings", (c) =>
	c.json({
		time: c.env.agent.services.bicho.birthdayTime(),
		timezone: "Europe/Madrid",
	}),
);
bichoRoutes.patch("/birthday-settings", async (c) => {
	const { time } = await body(c, birthdaySettingsSchema);
	await c.env.agent.services.bicho.setBirthdayTime(time);
	return c.json({ time, timezone: "Europe/Madrid" });
});
bichoRoutes.get("/saved-links", (c) =>
	c.json({ links: c.env.agent.services.bicho.saved() }),
);
bichoRoutes.post("/saved-links", async (c) =>
	c.json(
		c.env.agent.services.bicho.saveLink(await body(c, savedLinkSchema)),
		201,
	),
);
bichoRoutes.patch("/saved-links/:id", async (c) =>
	c.json({
		note: c.env.agent.services.bicho.updateSaved(
			c.req.param("id"),
			await body(c, savedLinkSchema),
		),
	}),
);
bichoRoutes.get("/calendar/events", (c) =>
	c.json({ events: c.env.agent.services.bicho.events() }),
);
bichoRoutes.post("/calendar/events", async (c) =>
	c.json(
		{
			event: c.env.agent.services.bicho.createEvent(
				await body(c, calendarEventSchema),
			),
		},
		201,
	),
);
bichoRoutes.post("/calendar/events/:id/claim", async (c) => {
	const input = await body(c, calendarClaimSchema);
	c.env.agent.services.bicho.assertCalendarAccess(
		c.req.param("id"),
		c.get("remote")?.id,
	);
	return c.json(
		c.env.agent.services.bicho.claimCalendar(
			c.req.param("id"),
			input.attempt_id,
		),
	);
});
bichoRoutes.post("/calendar/events/:id/ack", async (c) => {
	const input = await body(c, calendarAckSchema);
	c.env.agent.services.bicho.assertCalendarAccess(
		c.req.param("id"),
		c.get("remote")?.id,
	);
	return c.json({
		event: c.env.agent.services.bicho.acknowledgeCalendar(
			c.req.param("id"),
			input,
		),
	});
});
bichoRoutes.post("/calendar/events/:id/authorize", async (c) => {
	const input = await body(
		c,
		z.object({ confirmed: z.literal(true), token_id: z.string().uuid() }),
	);
	c.env.agent.services.bicho.authorizeCalendar(
		c.req.param("id"),
		input.token_id,
	);
	return c.json({ authorized: true });
});
bichoRoutes.post("/birthdays/:id/calendar", async (c) => {
	await body(c, confirmation);
	return c.json({
		event: c.env.agent.services.bicho.prepareBirthdayCalendar(
			c.req.param("id"),
		),
	});
});

bichoRoutes.post("/calendar/events/:id/reset", async (c) => {
	await body(c, z.object({ confirmed_absent: z.literal(true) }));
	return c.json({
		event: c.env.agent.services.bicho.resetCalendar(c.req.param("id")),
	});
});
