import type { KeepInTouchFrequency } from "@/db/keep-in-touch";
import { APP_TIME_ZONE } from "@/lib/time-zone";

const pluralRules = new Intl.PluralRules("ru");
const numberFormat = new Intl.NumberFormat("ru-RU");
const dateTimeFormat = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: APP_TIME_ZONE,
});
// A due date is a calendar day with no time, so it is read and printed in UTC:
// no time zone can move it to the day before
const dayMonthFormat = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

// Buttons of the "Как часто общаться" switch
export const NO_FREQUENCY_LABEL = "Не задано";
export const FREQUENCY_SHORT_LABELS: Record<KeepInTouchFrequency, string> = {
  week: "Неделя",
  month: "Месяц",
  quarter: "Квартал",
  year: "Год",
};

// The "Пора связаться" block: "Раз в месяц · просрочено на 12 дней"
export const FREQUENCY_LABELS: Record<KeepInTouchFrequency, string> = {
  week: "Раз в неделю",
  month: "Раз в месяц",
  quarter: "Раз в квартал",
  year: "Раз в год",
};

const dayForms = { one: "день", few: "дня", many: "дней" };

type PluralForms = { one: string; few: string; many: string };

// Picks the Russian plural form: 1 контакт, 2 контакта, 5 контактов
export function pluralize(count: number, forms: PluralForms) {
  const rule = pluralRules.select(count);
  if (rule === "one") return forms.one;
  if (rule === "few") return forms.few;
  return forms.many;
}

export function formatNumber(value: number) {
  return numberFormat.format(value);
}

export function formatDateTime(date: Date) {
  return dateTimeFormat.format(date);
}

// "2026-11-28" -> "28 ноября"; the year only when it is not the current one:
// "28 января 2027"
export function formatDueDate(day: string, currentYear: number) {
  const date = new Date(`${day}T00:00:00Z`);
  const dayMonth = dayMonthFormat.format(date);
  const year = date.getUTCFullYear();
  return year === currentYear ? dayMonth : `${dayMonth} ${year}`;
}

// For a due date that has come: "сегодня", "просрочено на 12 дней"
export function formatOverdue(overdueDays: number) {
  if (overdueDays === 0) return "сегодня";
  return `просрочено на ${formatNumber(overdueDays)} ${pluralize(overdueDays, dayForms)}`;
}

// First letters of the first two words: "Анна Смирнова" -> "АС"
export function getInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => Array.from(word)[0] ?? "")
    .join("")
    .toUpperCase();
}

// Builds a tel: link, or returns null when the text does not look like a number
export function getPhoneHref(phone: string) {
  const dialable = phone.replace(/[^\d+]/g, "");
  return dialable.replace(/\D/g, "").length >= 5 ? `tel:${dialable}` : null;
}
