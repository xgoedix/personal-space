import { describe, it, expect } from "vitest";
import { computeNextRun, scheduleSpecSchema } from "../src/recurrence";
import { birthdaySchema } from "../src/bicho";
describe("cumpleaños anuales en Madrid", () => {
	it.each([
		[5, 18, "2027-05-18T09:00:00.000Z"],
		[2, 14, "2027-02-14T10:00:00.000Z"],
		[3, 28, "2027-03-28T09:00:00.000Z"],
		[10, 31, "2027-10-31T10:00:00.000Z"],
	])("11:00 local para %s/%s", (month, day, expected) => {
		const spec = scheduleSpecSchema.parse({
			type: "yearly",
			month,
			day,
			time: "11:00",
			timezone: "Europe/Madrid",
		});
		const first = computeNextRun(
			spec,
			"Pacific/Honolulu",
			new Date("2027-01-01T00:00Z"),
		)!;
		expect(first.toISOString()).toBe(expected);
		const next = computeNextRun(spec, "UTC", first)!;
		expect(next.getUTCFullYear()).toBe(2028);
		expect(
			new Intl.DateTimeFormat("es", {
				timeZone: "Europe/Madrid",
				hour: "2-digit",
				minute: "2-digit",
			}).format(next),
		).toBe("11:00");
	});
	it("29 febrero usa 28 en años no bisiestos y vuelve a 29 en bisiestos", () => {
		const spec = scheduleSpecSchema.parse({
			type: "yearly",
			month: 2,
			day: 29,
			time: "11:00",
			timezone: "Europe/Madrid",
		});
		let next = new Date("2027-01-01T00:00Z");
		for (const date of [
			"2027-02-28",
			"2028-02-29",
			"2029-02-28",
			"2030-02-28",
		]) {
			next = computeNextRun(spec, "UTC", next)!;
			expect(next.toISOString()).toBe(`${date}T10:00:00.000Z`);
		}
		expect(
			computeNextRun(spec, "UTC", new Date("2099-03-01"))!.toISOString(),
		).toBe("2100-02-28T10:00:00.000Z");
	});
	it("rechaza fechas imposibles y no inventa año de nacimiento", () => {
		expect(
			birthdaySchema.safeParse({ name: "Prueba", month: 4, day: 31 }).success,
		).toBe(false);
		expect(
			birthdaySchema.safeParse({
				name: "Prueba",
				month: 2,
				day: 29,
				birth_year: 2027,
			}).success,
		).toBe(false);
		expect(
			birthdaySchema.parse({ name: "Prueba", month: 2, day: 29 }).birth_year,
		).toBeUndefined();
		expect(
			scheduleSpecSchema.safeParse({
				type: "yearly",
				month: 2,
				day: 30,
				time: "11:00",
			}).success,
		).toBe(false);
	});
});
