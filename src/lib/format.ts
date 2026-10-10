const pluralRules = new Intl.PluralRules("ru");
const numberFormat = new Intl.NumberFormat("ru-RU");
const dateTimeFormat = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

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
