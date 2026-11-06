import type { ScheduleSpec } from "@talorys/shared";

export function describeScheduleEs(schedule: ScheduleSpec): string {
  switch (schedule.type) {
    case "once": return `Una vez · ${schedule.at.replace("T", " · ")}`;
    case "daily": return `Cada día a las ${schedule.time}`;
    case "weekly": return `${schedule.days.map(d => ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"][d]).join(", ")} · ${schedule.time}`;
    case "monthly": return `Cada mes el día ${schedule.day} a las ${schedule.time}${schedule.day > 28 ? " (o el último día del mes)" : ""}`;
    case "yearly": return `Cada año el ${schedule.day}/${schedule.month} a las ${schedule.time}${schedule.timezone ? ` · ${schedule.timezone}` : ""}${schedule.month === 2 && schedule.day === 29 ? " (28 de febrero en años no bisiestos)" : ""}`;
    case "interval": return `Cada ${schedule.minutes} minutos`;
  }
}
