export type WeekStartDay = "monday" | "sunday";

export function alignToWeekStart(iso: string, weekStart: WeekStartDay) {
  const d = new Date(iso + "T00:00:00Z");
  const day = d.getUTCDay(); // 0 = su, 1 = ma
  const startIndex = weekStart === "monday" ? 1 : 0;
  const diff = (day - startIndex + 7) % 7;
  d.setUTCDate(d.getUTCDate() - diff);
  return d.toISOString().slice(0, 10);
}
