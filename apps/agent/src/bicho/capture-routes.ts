import { captureSchema } from "@talorys/shared";
import { Hono } from "hono";
import type { AppEnv } from "../api/app";
import { AppError } from "../api/errors";
import { body } from "../api/middleware";
import { captureResult, startCapture } from "./capture";
export const captureRoutes = new Hono<AppEnv>();
captureRoutes.use("/capture*", async (c, next) => {
	if (c.get("remote")?.capability !== "capture")
		throw new AppError(
			"FORBIDDEN",
			"Esta operación necesita el token específico de Atajos.",
		);
	await next();
});
captureRoutes.post("/capture", async (c) => {
	const input = await body(c, captureSchema, 40 * 1024);
	const agent = c.env.agent;
	const result = await startCapture(
		agent.services,
		agent.aiProvider(),
		c.get("remote")!,
		input,
		(work) => agent.background(work),
	);
	return c.json(result, result.status === "running" ? 202 : 200);
});
captureRoutes.get("/capture/calendar", (c) =>
	c.json({
		events: c.env.agent.services.bicho
			.calendarForToken(c.get("remote")!.id)
			.filter((e) => e.apple_status !== "created"),
	}),
);
captureRoutes.get("/capture/:id", (c) =>
	c.json(
		captureResult(c.env.agent.services, c.req.param("id"), c.get("remote")!.id),
	),
);
