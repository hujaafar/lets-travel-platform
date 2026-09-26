import type { Travel } from "./types";

export function moveCalendarMonth(current: Date, delta: number) {
  return new Date(current.getFullYear(), current.getMonth() + delta, 1, 12);
}

export function calendarDateKey(month: Date, day: number) {
  return `${String(month.getFullYear()).padStart(4, "0")}-${String(month.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function calendarPeriod(month: Date, selectedDay: number | null) {
  const lastDay = new Date(
    month.getFullYear(),
    month.getMonth() + 1,
    0,
  ).getDate();
  if (
    selectedDay !== null &&
    (!Number.isInteger(selectedDay) || selectedDay < 1 || selectedDay > lastDay)
  )
    throw new Error("Selected day is outside this month");
  return {
    start: calendarDateKey(month, selectedDay ?? 1),
    end: calendarDateKey(month, selectedDay ?? lastDay),
  };
}

export function travelsInPeriod(
  travels: readonly Travel[],
  start: string,
  end = start,
) {
  return travels.filter(
    (travel) =>
      travel.status !== "ARCHIVED" &&
      travel.start_date.slice(0, 10) <= end &&
      travel.end_date.slice(0, 10) >= start,
  );
}

export function calendarAgenda(
  travels: readonly Travel[],
  month: Date,
  selectedDay: number | null,
) {
  const { start, end } = calendarPeriod(month, selectedDay);
  return travelsInPeriod(travels, start, end);
}
